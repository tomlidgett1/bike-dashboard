"use client";

import * as React from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type GenieTransitionPhase = "idle" | "gather" | "peak" | "release";

const MOTES = 130;

const GOLD = new THREE.Color("#f4c84a");
const LILAC = new THREE.Color("#d9c6ff");

type PhaseTargets = { particles: number };

function targetsForPhase(phase: GenieTransitionPhase): PhaseTargets {
  switch (phase) {
    case "gather":
      return { particles: 0.85 };
    case "peak":
      return { particles: 1 };
    case "release":
      return { particles: 0 };
    default:
      return { particles: 0 };
  }
}

function approach(current: number, target: number, delta: number, speed: number) {
  return current + (target - current) * Math.min(1, delta * speed);
}

/* ── A few softly drifting motes ────────────────────────────────────── */

const moteVertex = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aScale;
  varying float vSeed;

  void main() {
    vec3 pos = position;
    // Slow upward drift with a gentle horizontal sway.
    pos.y = mod(pos.y + uTime * (0.12 + aSeed * 0.12) + 4.0, 8.0) - 4.0;
    pos.x += sin(uTime * 0.5 + aSeed * 6.2831) * 0.18;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aScale * uPixelRatio * 6.0 * (6.0 / -mv.z) * (0.4 + uIntensity);
    vSeed = aSeed;
  }
`;

const moteFragment = /* glsl */ `
  precision highp float;
  uniform float uIntensity;
  uniform vec3 uGold;
  uniform vec3 uLilac;
  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = 1.0 - smoothstep(0.0, 0.5, d);
    vec3 col = mix(uGold, uLilac, step(0.82, vSeed) * 0.7);
    gl_FragColor = vec4(col, soft * 0.5 * uIntensity);
  }
`;

function buildMotes(count: number) {
  const positions = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const scale = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 9;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
    seed[i] = Math.random();
    scale[i] = 0.5 + Math.random() * 1.2;
  }
  return { positions, seed, scale };
}

function Motes({ phaseRef, reduced }: { phaseRef: React.MutableRefObject<PhaseTargets>; reduced: boolean }) {
  const matRef = React.useRef<THREE.ShaderMaterial>(null);
  const stateRef = React.useRef({ time: 0, intensity: 0 });

  const geometry = React.useMemo(() => {
    const { positions, seed, scale } = buildMotes(MOTES);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    return g;
  }, []);

  const uniforms = React.useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uPixelRatio: { value: Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2) },
      uGold: { value: GOLD },
      uLilac: { value: LILAC },
    }),
    [],
  );

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    const s = stateRef.current;
    s.time += delta * (reduced ? 0.4 : 1);
    s.intensity = approach(s.intensity, phaseRef.current.particles, delta, 2.4);
    mat.uniforms.uTime.value = s.time;
    mat.uniforms.uIntensity.value = s.intensity;
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={moteVertex}
        fragmentShader={moteFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function SceneContents({ phase, reduced }: { phase: GenieTransitionPhase; reduced: boolean }) {
  const phaseRef = React.useRef<PhaseTargets>(targetsForPhase(phase));
  React.useEffect(() => {
    phaseRef.current = targetsForPhase(phase);
  }, [phase]);

  return (
    <>
      <Motes phaseRef={phaseRef} reduced={reduced} />
    </>
  );
}

export default function GenieTransitionScene({
  phase,
  reduced = false,
}: {
  phase: GenieTransitionPhase;
  reduced?: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 6], fov: 52 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <SceneContents phase={phase} reduced={reduced} />
    </Canvas>
  );
}
