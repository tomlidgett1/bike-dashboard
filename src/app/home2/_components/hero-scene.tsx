"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MotionValue } from "framer-motion";

const COUNT = 4200;
const BRAND = new THREE.Color("#ffde59");
const MUTED = new THREE.Color("#e8e8ea");

const vertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uScroll;
  uniform float uSize;
  uniform float uPixelRatio;
  attribute float aRand;
  attribute float aScale;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    float wave = sin(pos.x * 0.35 + uTime * 0.45) * 0.18;
    wave += cos(pos.y * 0.28 + uTime * 0.38) * 0.14;
    pos.z += wave;
    pos.y += uScroll * 0.35;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * uPixelRatio * (8.0 / -mv.z);
    vAlpha = 0.35 + aRand * 0.55;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = 1.0 - smoothstep(0.18, 0.5, d);
    vec3 col = mix(uColorB, uColorA, soft * 0.55);
    gl_FragColor = vec4(col, soft * vAlpha);
  }
`;

function buildPositions(count: number) {
  const positions = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  const scale = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = Math.cbrt(Math.random()) * 3.2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    positions[i * 3 + 2] = r * Math.cos(phi) * 0.6;
    rand[i] = Math.random();
    scale[i] = 0.6 + Math.random() * 1.4;
  }
  return { positions, rand, scale };
}

function WindowSizer() {
  const setSize = useThree((s) => s.setSize);
  React.useEffect(() => {
    const apply = () => setSize(window.innerWidth, window.innerHeight);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [setSize]);
  return null;
}

function ParticleField({
  progress,
  reduced,
}: {
  progress: MotionValue<number>;
  reduced: boolean;
}) {
  const ref = React.useRef<THREE.Points>(null);
  const matRef = React.useRef<THREE.ShaderMaterial>(null);
  const { positions, rand, scale } = React.useMemo(() => buildPositions(COUNT), []);

  const geometry = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    g.setAttribute("aScale", new THREE.BufferAttribute(scale, 1));
    return g;
  }, [positions, rand, scale]);

  const uniforms = React.useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uSize: { value: 2.4 },
      uPixelRatio: { value: Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2) },
      uColorA: { value: BRAND },
      uColorB: { value: MUTED },
    }),
    []
  );

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state, delta) => {
    const mat = matRef.current;
    const points = ref.current;
    if (!mat || !points) return;

    const scroll = progress.get() * 2.5;
    mat.uniforms.uScroll.value += (scroll - mat.uniforms.uScroll.value) * Math.min(delta * 3, 1);

    if (!reduced) {
      mat.uniforms.uTime.value += delta;
      points.rotation.y += delta * 0.04;
      points.rotation.x = Math.sin(state.clock.elapsedTime * 0.08) * 0.06;
    }
  });

  return (
    <points ref={ref} geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

export default function HeroScene({
  scrollProgress,
  reduced = false,
}: {
  scrollProgress: MotionValue<number>;
  reduced?: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 52 }}
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", display: "block" }}
      resize={{ scroll: false }}
      frameloop={reduced ? "demand" : "always"}
    >
      <WindowSizer />
      <ambientLight intensity={0.6} />
      <ParticleField progress={scrollProgress} reduced={reduced} />
    </Canvas>
  );
}
