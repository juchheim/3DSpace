import type { PhysicsTuning, Vector3 } from "@3dspace/contracts";
import {
  FFA_MAIN_RADIUS,
  isAngleWithinFreeForAllExitArc,
  type ColliderSpec,
  type CuboidColliderSpec,
  type GroundColliderSpec,
  type RampColliderSpec
} from "@3dspace/room-engine";

import { AVATAR_SPRINT_JUMP_HEIGHT_MULTIPLIER, AVATAR_SPRINT_SPEED_MULTIPLIER } from "../avatarSprint";
import { loadRapier } from "./rapier";

const FIXED_TIMESTEP_SECONDS = 1 / 60;
const GROUND_COLLIDER_HALF_HEIGHT = 0.25;

type RapierModule = Awaited<ReturnType<typeof loadRapier>>;

export type PhysicsStepInput = {
  moveX: number;
  moveZ: number;
  dtSeconds: number;
  /** Shift sprint while moving horizontally. */
  sprinting?: boolean;
};

export type PhysicsStepOutput = {
  position: Vector3;
  grounded: boolean;
  vy: number;
  airborne: boolean;
};

function toRapierVector(RAPIER: RapierModule, value: { x: number; y: number; z: number }) {
  return new RAPIER.Vector3(value.x, value.y, value.z);
}

function yawToQuaternion(yawRadians: number) {
  const half = yawRadians / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

function clampHorizontalInput(moveX: number, moveZ: number) {
  const magnitude = Math.hypot(moveX, moveZ);
  if (magnitude <= 1 || magnitude === 0) return { x: moveX, z: moveZ };
  return { x: moveX / magnitude, z: moveZ / magnitude };
}

function capsuleCenterY(feetY: number, tuning: PhysicsTuning) {
  return feetY + tuning.capsuleHeight / 2;
}

function feetPositionFromCenter(center: { x: number; y: number; z: number }, tuning: PhysicsTuning): Vector3 {
  return {
    x: center.x,
    y: center.y - tuning.capsuleHeight / 2,
    z: center.z
  };
}

function setColliderPose(RAPIER: RapierModule, desc: { setTranslation: (x: number, y: number, z: number) => unknown; setRotation: (rot: { x: number; y: number; z: number; w: number }) => unknown; }, spec: CuboidColliderSpec) {
  desc.setTranslation(spec.center.x, spec.center.y, spec.center.z);
  if (spec.rotationY) {
    desc.setRotation(yawToQuaternion(spec.rotationY));
  } else {
    desc.setRotation(yawToQuaternion(0));
  }
}

function buildRampSlopeVertices(spec: RampColliderSpec) {
  const highZ = spec.climbAxis === "z" ? (spec.climbSign === 1 ? spec.maxZ : spec.minZ) : spec.maxZ;
  const lowZ = spec.climbAxis === "z" ? (spec.climbSign === 1 ? spec.minZ : spec.maxZ) : spec.minZ;
  const highX = spec.climbAxis === "x" ? (spec.climbSign === 1 ? spec.maxX : spec.minX) : spec.maxX;
  const lowX = spec.climbAxis === "x" ? (spec.climbSign === 1 ? spec.minX : spec.maxX) : spec.minX;

  if (spec.climbAxis === "z") {
    return new Float32Array([
      spec.minX, spec.lowY, lowZ,
      spec.maxX, spec.lowY, lowZ,
      spec.minX, spec.highY, highZ,
      spec.maxX, spec.highY, highZ
    ]);
  }

  return new Float32Array([
    lowX, spec.lowY, spec.minZ,
    lowX, spec.highY, spec.maxZ,
    highX, spec.lowY, spec.minZ,
    highX, spec.highY, spec.maxZ
  ]);
}

export class PhysicsController {
  private constructor(
    private readonly RAPIER: RapierModule,
    private readonly world: InstanceType<RapierModule["World"]>,
    private readonly characterController: InstanceType<RapierModule["KinematicCharacterController"]>,
    private readonly capsuleBody: InstanceType<RapierModule["RigidBody"]>,
    private readonly capsuleCollider: InstanceType<RapierModule["Collider"]>,
    private tuning: PhysicsTuning,
    private currentKey: string | null,
    private staticColliders: Array<InstanceType<RapierModule["Collider"]>>,
    private hasFfaPerimeter: boolean,
    private accumulatorSeconds: number,
    private verticalVelocity: number,
    private grounded: boolean,
    private coyoteTimeRemainingSeconds: number,
    private jumpQueued: boolean,
    private jumpSprintQueued: boolean
  ) {}

  static async create(input: {
    tuning: PhysicsTuning;
    spec: ColliderSpec[];
    cacheKey?: string;
    initialPosition?: Vector3;
  }) {
    const RAPIER = await loadRapier();
    const world = new RAPIER.World(new RAPIER.Vector3(0, -input.tuning.gravity, 0));
    world.timestep = FIXED_TIMESTEP_SECONDS;
    const characterController = world.createCharacterController(Math.max(0.01, input.tuning.capsuleRadius * 0.05));

    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .lockRotations()
      .setCcdEnabled(true)
      .setTranslation(
        input.initialPosition?.x ?? 0,
        capsuleCenterY(input.initialPosition?.y ?? 0, input.tuning),
        input.initialPosition?.z ?? 0
      );
    const capsuleBody = world.createRigidBody(bodyDesc);
    const halfHeight = Math.max((input.tuning.capsuleHeight - input.tuning.capsuleRadius * 2) / 2, 0);
    const capsuleDesc = RAPIER.ColliderDesc.capsule(halfHeight, input.tuning.capsuleRadius);
    const capsuleCollider = world.createCollider(capsuleDesc, capsuleBody);

    const controller = new PhysicsController(
      RAPIER,
      world,
      characterController,
      capsuleBody,
      capsuleCollider,
      input.tuning,
      null,
      [],
      false,
      0,
      0,
      false,
      0,
      false,
      false
    );

    controller.setTuning(input.tuning);
    controller.syncColliders(input.spec, input.cacheKey ?? "");
    controller.seedPosition(input.initialPosition ?? { x: 0, y: 0, z: 0 });
    controller.step({ moveX: 0, moveZ: 0, dtSeconds: FIXED_TIMESTEP_SECONDS });
    return controller;
  }

  private applyBodyPosition(position: Vector3) {
    const center = toRapierVector(this.RAPIER, {
      x: position.x,
      y: capsuleCenterY(position.y, this.tuning),
      z: position.z
    });
    this.capsuleBody.setTranslation(center, true);
    this.capsuleBody.setNextKinematicTranslation(center);
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  private buildCollider(spec: ColliderSpec) {
    if (spec.kind === "ground") {
      const desc = this.RAPIER.ColliderDesc.cuboid(
        (spec.maxX - spec.minX) / 2,
        GROUND_COLLIDER_HALF_HEIGHT,
        (spec.maxZ - spec.minZ) / 2
      );
      desc.setTranslation(
        (spec.minX + spec.maxX) / 2,
        spec.y - GROUND_COLLIDER_HALF_HEIGHT,
        (spec.minZ + spec.maxZ) / 2
      );
      return this.world.createCollider(desc);
    }

    if (spec.kind === "cuboid") {
      const desc = this.RAPIER.ColliderDesc.cuboid(spec.half.x, spec.half.y, spec.half.z);
      setColliderPose(this.RAPIER, desc, spec);
      return this.world.createCollider(desc);
    }

    if (spec.kind === "trimesh") {
      const desc = this.RAPIER.ColliderDesc.trimesh(spec.vertices, spec.indices);
      return this.world.createCollider(desc);
    }

    const vertices = buildRampSlopeVertices(spec);
    const desc = this.RAPIER.ColliderDesc.convexHull(vertices);
    if (!desc) {
      throw new Error(`Failed to build convex hull for ramp collider ${spec.id}`);
    }
    return this.world.createCollider(desc);
  }

  private applyFfaPerimeterClamp(oldFeet: Vector3, nextFeet: Vector3): Vector3 {
    if (!this.hasFfaPerimeter) return nextFeet;

    const oldRadius = Math.hypot(oldFeet.x, oldFeet.z);
    const newRadius = Math.hypot(nextFeet.x, nextFeet.z);
    const shouldApplyClamp =
      oldRadius <= FFA_MAIN_RADIUS + this.tuning.capsuleRadius ||
      newRadius <= FFA_MAIN_RADIUS + this.tuning.capsuleRadius;

    if (!shouldApplyClamp) return nextFeet;

    const angle = Math.atan2(nextFeet.z, nextFeet.x);
    if (isAngleWithinFreeForAllExitArc(angle)) return nextFeet;

    const maxRadius = FFA_MAIN_RADIUS - this.tuning.capsuleRadius;
    if (newRadius <= maxRadius || newRadius === 0) return nextFeet;

    const scale = maxRadius / newRadius;
    return {
      ...nextFeet,
      x: nextFeet.x * scale,
      z: nextFeet.z * scale
    };
  }

  private currentOutput(grounded: boolean): PhysicsStepOutput {
    return {
      position: feetPositionFromCenter(this.capsuleBody.translation(), this.tuning),
      grounded,
      vy: this.verticalVelocity,
      airborne: !grounded
    };
  }

  private substep(moveX: number, moveZ: number, sprinting: boolean) {
    const normalized = clampHorizontalInput(moveX, moveZ);
    const wasGrounded = this.grounded;
    const coyoteSeconds = this.tuning.coyoteTimeMs / 1000;

    if (wasGrounded) {
      this.coyoteTimeRemainingSeconds = coyoteSeconds;
    } else {
      this.coyoteTimeRemainingSeconds = Math.max(0, this.coyoteTimeRemainingSeconds - FIXED_TIMESTEP_SECONDS);
    }

    const jumpAllowed = wasGrounded || this.coyoteTimeRemainingSeconds > 0;
    const jumpRequested = this.jumpQueued;
    const jumpTriggered = jumpRequested && jumpAllowed;
    this.jumpQueued = false;

    if (jumpTriggered) {
      const jumpHeight =
        this.tuning.jumpHeight * (this.jumpSprintQueued ? AVATAR_SPRINT_JUMP_HEIGHT_MULTIPLIER : 1);
      this.jumpSprintQueued = false;
      this.verticalVelocity = Math.sqrt(2 * this.tuning.gravity * jumpHeight);
      this.grounded = false;
      this.coyoteTimeRemainingSeconds = 0;
    } else {
      this.verticalVelocity = Math.max(
        this.verticalVelocity - this.tuning.gravity * FIXED_TIMESTEP_SECONDS,
        -this.tuning.maxFallSpeed
      );
    }

    const horizontalControl = wasGrounded ? 1 : this.tuning.airControl;
    const moveSpeed =
      this.tuning.moveSpeed * (sprinting ? AVATAR_SPRINT_SPEED_MULTIPLIER : 1) * horizontalControl;

    const desired = toRapierVector(this.RAPIER, {
      x: normalized.x * moveSpeed * FIXED_TIMESTEP_SECONDS,
      y: this.verticalVelocity * FIXED_TIMESTEP_SECONDS,
      z: normalized.z * moveSpeed * FIXED_TIMESTEP_SECONDS
    });

    this.characterController.computeColliderMovement(this.capsuleCollider, desired);
    const movement = this.characterController.computedMovement();
    const currentCenter = this.capsuleBody.translation();
    const nextFeet = this.applyFfaPerimeterClamp(
      feetPositionFromCenter(currentCenter, this.tuning),
      {
        x: currentCenter.x + movement.x,
        y: currentCenter.y + movement.y - this.tuning.capsuleHeight / 2,
        z: currentCenter.z + movement.z
      }
    );

    this.capsuleBody.setNextKinematicTranslation(
      toRapierVector(this.RAPIER, {
        x: nextFeet.x,
        y: capsuleCenterY(nextFeet.y, this.tuning),
        z: nextFeet.z
      })
    );
    this.world.step();

    this.grounded = this.characterController.computedGrounded();

    if (this.grounded) {
      this.verticalVelocity = 0;
      this.coyoteTimeRemainingSeconds = coyoteSeconds;
    } else if (jumpTriggered) {
      this.verticalVelocity = Math.max(
        this.verticalVelocity - this.tuning.gravity * FIXED_TIMESTEP_SECONDS,
        -this.tuning.maxFallSpeed
      );
    }

    return this.currentOutput(this.grounded);
  }

  setTuning(tuning: PhysicsTuning) {
    this.tuning = tuning;
    this.world.gravity = new this.RAPIER.Vector3(0, -tuning.gravity, 0);
    this.characterController.setMaxSlopeClimbAngle((tuning.maxSlopeClimbDeg * Math.PI) / 180);
    this.characterController.setMinSlopeSlideAngle(
      Math.min((tuning.maxSlopeClimbDeg * Math.PI) / 180 + 0.01, Math.PI / 2)
    );
    this.characterController.enableAutostep(
      tuning.autoStepHeight,
      Math.max(tuning.capsuleRadius * 0.5, 0.1),
      false
    );
    this.characterController.enableSnapToGround(tuning.snapToGroundDist);
  }

  syncColliders(spec: ColliderSpec[], cacheKey: string) {
    if (cacheKey === this.currentKey) return;

    for (const collider of this.staticColliders) {
      this.world.removeCollider(collider, false);
    }

    this.staticColliders = spec.map((entry) => this.buildCollider(entry));
    this.currentKey = cacheKey;
    this.hasFfaPerimeter = spec.some(
      (entry) => entry.kind === "cuboid" && entry.source === "wall" && entry.id.startsWith("ffa-perim-")
    );
  }

  step(input: PhysicsStepInput): PhysicsStepOutput {
    this.accumulatorSeconds += Math.max(0, input.dtSeconds);
    const sprinting = input.sprinting ?? false;
    let last = this.currentOutput(this.grounded);

    while (this.accumulatorSeconds >= FIXED_TIMESTEP_SECONDS) {
      last = this.substep(input.moveX, input.moveZ, sprinting);
      this.accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
    }

    return this.currentOutput(last.grounded);
  }

  requestJump(sprinting = false) {
    this.jumpQueued = true;
    this.jumpSprintQueued = sprinting;
  }

  seedPosition(position: Vector3) {
    this.applyBodyPosition(position);
    this.accumulatorSeconds = 0;
  }

  setPosition(position: Vector3) {
    this.applyBodyPosition(position);
    this.verticalVelocity = 0;
    this.accumulatorSeconds = 0;
    this.grounded = false;
    this.coyoteTimeRemainingSeconds = 0;
    this.jumpQueued = false;
    this.jumpSprintQueued = false;
  }

  position() {
    return feetPositionFromCenter(this.capsuleBody.translation(), this.tuning);
  }

  dispose() {
    this.world.free();
  }
}
