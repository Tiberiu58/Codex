import { BABYLON } from "./babylon.js"
import { PLAYER_CONFIG, TELEPORT_CONFIG } from "./config.js"
import { clamp, damp } from "./utils.js"

export class TeleportAbility {
  constructor(scene, player, input, level) {
    this.scene = scene
    this.player = player
    this.input = input
    this.level = level

    this.state = "idle"
    this.cooldownTimer = 0
    this.castTimer = 0
    this.previewVisible = false
    this.targetValid = false
    this.statusText = ""
    this.statusTimer = 0
    this.completionPulseTimer = 0
    this.targetPoint = new BABYLON.Vector3()
    this.lockedTargetPoint = new BABYLON.Vector3()
    this.previewAlpha = 0

    this.createPreviewMeshes()
    this.hidePreview()
  }

  createPreviewMeshes() {
    this.previewRoot = new BABYLON.TransformNode("teleportPreviewRoot", this.scene)

    this.validMaterial = new BABYLON.StandardMaterial("teleportValidMaterial", this.scene)
    this.validMaterial.diffuseColor = BABYLON.Color3.FromHexString("#7affc4")
    this.validMaterial.emissiveColor = BABYLON.Color3.FromHexString("#1f9a6c")
    this.validMaterial.specularColor = BABYLON.Color3.Black()
    this.validMaterial.alpha = 0

    this.invalidMaterial = new BABYLON.StandardMaterial("teleportInvalidMaterial", this.scene)
    this.invalidMaterial.diffuseColor = BABYLON.Color3.FromHexString("#ff7e7e")
    this.invalidMaterial.emissiveColor = BABYLON.Color3.FromHexString("#a03434")
    this.invalidMaterial.specularColor = BABYLON.Color3.Black()
    this.invalidMaterial.alpha = 0

    this.pulseMaterial = new BABYLON.StandardMaterial("teleportPulseMaterial", this.scene)
    this.pulseMaterial.diffuseColor = BABYLON.Color3.FromHexString("#c0fff0")
    this.pulseMaterial.emissiveColor = BABYLON.Color3.FromHexString("#5fd9c1")
    this.pulseMaterial.specularColor = BABYLON.Color3.Black()
    this.pulseMaterial.alpha = 0

    this.previewRing = BABYLON.MeshBuilder.CreateCylinder(
      "teleportPreviewRing",
      { diameter: 1.2, height: 0.03, tessellation: 20 },
      this.scene
    )
    this.previewRing.parent = this.previewRoot
    this.previewRing.position.y = 0.02
    this.previewRing.isPickable = false
    this.previewRing.renderingGroupId = 2

    this.previewPillar = BABYLON.MeshBuilder.CreateCylinder(
      "teleportPreviewPillar",
      { diameterTop: 0.08, diameterBottom: 0.18, height: TELEPORT_CONFIG.previewHeight, tessellation: 10 },
      this.scene
    )
    this.previewPillar.parent = this.previewRoot
    this.previewPillar.position.y = TELEPORT_CONFIG.previewHeight * 0.5
    this.previewPillar.isPickable = false
    this.previewPillar.renderingGroupId = 2

    this.previewPulse = BABYLON.MeshBuilder.CreateCylinder(
      "teleportPreviewPulse",
      { diameter: 1.1, height: 0.02, tessellation: 20 },
      this.scene
    )
    this.previewPulse.parent = this.previewRoot
    this.previewPulse.position.y = 0.015
    this.previewPulse.isPickable = false
    this.previewPulse.renderingGroupId = 2
    this.previewPulse.material = this.pulseMaterial
  }

  reset() {
    this.state = "idle"
    this.cooldownTimer = 0
    this.castTimer = 0
    this.targetValid = false
    this.statusText = ""
    this.statusTimer = 0
    this.completionPulseTimer = 0
    this.previewAlpha = 0
    this.hidePreview()
  }

  update(dt, active) {
    if (!active) {
      if (this.state === "targeting" || this.state === "casting") {
        this.cancelTargeting()
      }
      this.hidePreview()
      return
    }

    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt)
      if (this.cooldownTimer === 0 && this.state === "cooldown") {
        this.state = "idle"
      }
    }

    if (this.statusTimer > 0) {
      this.statusTimer = Math.max(0, this.statusTimer - dt)
      if (this.statusTimer === 0 && this.state === "idle" && this.cooldownTimer <= 0) {
        this.statusText = ""
      }
    }

    if (this.completionPulseTimer > 0) {
      this.completionPulseTimer = Math.max(0, this.completionPulseTimer - dt)
    }

    if (this.consumeTeleportPressed()) {
      this.handleActivationPress()
    }

    if (this.state === "targeting") {
      this.refreshTarget()

      if (this.consumeFirePressed()) {
        this.confirmTarget()
      }
    } else if (this.state === "casting") {
      this.castTimer = Math.max(0, this.castTimer - dt)
      this.targetPoint.copyFrom(this.lockedTargetPoint)
      this.targetValid = true
      this.previewVisible = true

      if (this.castTimer === 0) {
        this.resolveTeleport()
      }
    } else {
      this.previewVisible = this.completionPulseTimer > 0
    }

    this.updatePreviewVisuals(dt)
  }

  handleActivationPress() {
    if (this.state === "casting") {
      return
    }

    if (this.state === "targeting") {
      this.cancelTargeting()
      return
    }

    if (this.cooldownTimer > 0) {
      this.setStatus(`Shadow Step cooling down: ${this.cooldownTimer.toFixed(1)}s`, 0.7)
      return
    }

    this.state = "targeting"
    this.setStatus("Shadow Step primed. Aim and left click to blink.", 1.2)
    this.refreshTarget()
  }

  refreshTarget() {
    const targetInfo = this.computeTarget()
    this.targetValid = targetInfo.valid
    this.targetPoint.copyFromFloats(targetInfo.x, this.level.floorY, targetInfo.z)
    this.previewVisible = true

    if (targetInfo.valid) {
      this.statusText = "Shadow Step ready. Left click to teleport."
      this.statusTimer = 0
    } else {
      this.statusText = targetInfo.reason
      this.statusTimer = 0.08
    }
  }

  computeTarget() {
    const look = this.player.getLookDirection()
    const horizontalLength = Math.hypot(look.x, look.z)
    const origin = this.player.getCenterPosition()

    if (horizontalLength < 0.0001) {
      return {
        valid: false,
        x: this.player.position.x,
        z: this.player.position.z,
        reason: "Shadow Step needs a clear forward angle.",
      }
    }

    const dirX = look.x / horizontalLength
    const dirZ = look.z / horizontalLength
    const horizontalWallDistance = this.level.raycastWalls(
      origin,
      { x: dirX, z: dirZ },
      TELEPORT_CONFIG.range
    )
    let targetDistance = Math.min(
      TELEPORT_CONFIG.range,
      Math.max(0, horizontalWallDistance - TELEPORT_CONFIG.wallBuffer)
    )

    if (look.y < -0.08) {
      const floorDistance = (this.level.floorY - this.player.getShootOrigin().y) / look.y
      if (floorDistance > 0) {
        targetDistance = Math.min(targetDistance, floorDistance * horizontalLength)
      }
    }

    targetDistance = clamp(targetDistance, 0, TELEPORT_CONFIG.range)

    const x = this.player.position.x + dirX * targetDistance
    const z = this.player.position.z + dirZ * targetDistance

    if (targetDistance < TELEPORT_CONFIG.minRange) {
      return {
        valid: false,
        x,
        z,
        reason: "Shadow Step needs a little more room.",
      }
    }

    const radius = PLAYER_CONFIG.radius + TELEPORT_CONFIG.clearancePadding
    const valid = this.level.validateTeleportTarget(origin, { x, z }, radius)

    return {
      valid,
      x,
      z,
      reason: valid
        ? ""
        : "Shadow Step target is blocked.",
    }
  }

  confirmTarget() {
    if (!this.targetValid) {
      this.setStatus("Shadow Step failed. Pick a clear landing spot.", 0.7)
      return
    }

    this.state = "casting"
    this.castTimer = TELEPORT_CONFIG.castTime
    this.lockedTargetPoint.copyFrom(this.targetPoint)
    this.clearFireState()
    this.setStatus("Shadow Step casting...", TELEPORT_CONFIG.castTime)
  }

  resolveTeleport() {
    this.player.teleportTo(this.lockedTargetPoint.x, this.lockedTargetPoint.z)
    this.cooldownTimer = TELEPORT_CONFIG.cooldown
    this.completionPulseTimer = TELEPORT_CONFIG.completionPulseTime
    this.state = "cooldown"
    this.targetValid = false
    this.previewVisible = true
    this.setStatus(`Shadow Step cooling down: ${this.cooldownTimer.toFixed(1)}s`, 0.9)
  }

  cancelTargeting() {
    this.state = this.cooldownTimer > 0 ? "cooldown" : "idle"
    this.targetValid = false
    this.previewVisible = false
    if (this.cooldownTimer <= 0) {
      this.statusText = ""
      this.statusTimer = 0
    }
  }

  updatePreviewVisuals(dt) {
    const shouldShow = this.previewVisible || this.completionPulseTimer > 0
    const targetAlpha = shouldShow ? 1 : 0
    this.previewAlpha = damp(this.previewAlpha, targetAlpha, 18, dt)

    if (this.previewAlpha < 0.01 && this.completionPulseTimer <= 0) {
      this.hidePreview()
      return
    }

    this.previewRoot.setEnabled(true)
    const activePoint = this.state === "casting" ? this.lockedTargetPoint : this.targetPoint
    this.previewRoot.position.set(activePoint.x, this.level.floorY, activePoint.z)

    const material = this.targetValid || this.state === "casting"
      ? this.validMaterial
      : this.invalidMaterial
    this.previewRing.material = material
    this.previewPillar.material = material

    const pulse = this.state === "casting"
      ? 0.65 + Math.sin(this.castTimer * 50) * 0.12
      : 0
    material.alpha = this.previewAlpha * (0.3 + pulse)
    this.previewPillar.scaling.y = this.state === "casting" ? 1.08 : 1
    this.previewPillar.position.y = TELEPORT_CONFIG.previewHeight * 0.5

    if (this.completionPulseTimer > 0) {
      const t = 1 - this.completionPulseTimer / TELEPORT_CONFIG.completionPulseTime
      this.previewPulse.scaling.x = 1 + t * 1.2
      this.previewPulse.scaling.z = 1 + t * 1.2
      this.pulseMaterial.alpha = (1 - t) * 0.6
    } else {
      this.previewPulse.scaling.x = 1
      this.previewPulse.scaling.z = 1
      this.pulseMaterial.alpha = 0
    }
  }

  hidePreview() {
    this.previewRoot.setEnabled(false)
    this.validMaterial.alpha = 0
    this.invalidMaterial.alpha = 0
    this.pulseMaterial.alpha = 0
  }

  setStatus(text, duration = 0.6) {
    this.statusText = text
    this.statusTimer = duration
  }

  consumeTeleportPressed() {
    return this.input.consumeTeleportPressed()
  }

  consumeFirePressed() {
    return this.input.consumeFirePressed()
  }

  clearFireState() {
    this.input.clearFireState()
  }

  blocksWeaponInput() {
    return this.state === "targeting" || this.state === "casting"
  }

  getStatusText() {
    if (this.state === "targeting" || this.state === "casting") {
      return this.statusText
    }

    if (this.statusTimer > 0) {
      return this.statusText
    }

    return ""
  }
}
