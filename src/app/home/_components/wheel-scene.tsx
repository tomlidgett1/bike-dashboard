"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { generateHomeShapes } from "./shapes";

const COUNT = 9000;

/* ------------------------------------------------------------------ */
/* Shaders (precision pinned to highp in BOTH stages so shared         */
/* uniforms match and the program links).                             */
/* ------------------------------------------------------------------ */

const vertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uProgress;   // 0 = wheel, 1 = Y
  uniform float uTurb;
  uniform float uSize;
  uniform float uPixelRatio;

  attribute vec3 aPosA;      // wheel
  attribute vec3 aPosB;      // Y
  attribute float aRand;
  attribute float aScale;

  varying float vRand;

  vec3 swirl(vec3 p) {
    return vec3(
      sin(p.y * 1.6 + uTime * 0.8),
      sin(p.z * 1.6 + uTime * 0.7),
      sin(p.x * 1.6 + uTime * 0.9)
    );
  }

  void main() {
    vRand = aRand;

    // spin the wheel around its axis (Z) for constant motion
    float a = uTime * 0.5;
    float ca = cos(a); float sa = sin(a);
    vec3 posA = vec3(aPosA.x * ca - aPosA.y * sa, aPosA.x * sa + aPosA.y * ca, aPosA.z);

    vec3 pos = mix(posA, aPosB, smoothstep(0.0, 1.0, clamp(uProgress, 0.0, 1.0)));
    pos += swirl(pos * 0.55 + aRand * 12.0) * uTurb * (0.35 + aRand * 0.75);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * aScale * uPixelRatio * (10.0 / -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uTime;
  varying float vRand;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = pow(smoothstep(0.5, 0.0, d), 1.6);
    float tw = 0.65 + 0.35 * sin(uTime * 2.2 + vRand * 30.0);
    vec3 col = mix(uColorA, uColorB, smoothstep(0.55, 1.0, vRand));
    gl_FragColor = vec4(col, alpha * tw);
  }
`;

/* ------------------------------------------------------------------ */
/* Time-based morph: spin the wheel, occasionally bloom into the "Y".  */
/* ------------------------------------------------------------------ */

const ease = (x: number) => x * x * (3 - 2 * x);

function morphAt(t: number): { m: number; turb: number } {
  const period = 13;
  const tt = t % period;
  if (tt < 5) return { m: 0, turb: 0 }; // wheel rests + spins
  if (tt < 6.6) {
    const p = (tt - 5) / 1.6;
    return { m: ease(p), turb: Math.sin(p * Math.PI) * 0.32 };
  }
  if (tt < 10) return { m: 1, turb: 0 }; // "Y" rests
  const p = (tt - 10) / (period - 10);
  return { m: 1 - ease(p), turb: Math.sin(p * Math.PI) * 0.32 };
}

/* ------------------------------------------------------------------ */
/* Robust sizing — measure the actual canvas parent and drive setSize. */
/* ------------------------------------------------------------------ */
function FitToParent() {
  const gl = useThree((s) => s.gl);
  const setSize = useThree((s) => s.setSize);
  React.useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const apply = () => {
      const r = parent.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize(r.width, r.height);
    };
    // The CSS module can apply a frame or two after mount, so the panel reads
    // 0 initially and the ResizeObserver doesn't always refire in headless
    // browsers. Retry across ~1s of frames until it has real dimensions.
    let raf = 0;
    let tries = 0;
    const tick = () => {
      apply();
      if (++tries < 60) raf = requestAnimationFrame(tick);
    };
    tick();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    window.addEventListener("resize", apply);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [gl, setSize]);
  return null;
}

function MorphPoints({ reduced }: { reduced: boolean }) {
  const matRef = React.useRef<THREE.ShaderMaterial>(null);
  const groupRef = React.useRef<THREE.Group>(null);
  const mouse = React.useRef({ x: 0, y: 0 });

  const shapes = React.useMemo(() => generateHomeShapes(COUNT), []);

  const geometry = React.useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(shapes.wheel.slice(), 3));
    g.setAttribute("aPosA", new THREE.BufferAttribute(shapes.wheel, 3));
    g.setAttribute("aPosB", new THREE.BufferAttribute(shapes.mono, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(shapes.rand, 1));
    g.setAttribute("aScale", new THREE.BufferAttribute(shapes.scale, 1));
    return g;
  }, [shapes]);

  const uniforms = React.useMemo(
    () => ({
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uTurb: { value: 0 },
      uSize: { value: 7.0 },
      uPixelRatio: { value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1 },
      uColorA: { value: new THREE.Color("#ffde59") },
      uColorB: { value: new THREE.Color("#fff7da") },
    }),
    [],
  );

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, delta) => {
    const mat = matRef.current;
    const group = groupRef.current;
    if (!mat || !group) return;

    if (reduced) {
      mat.uniforms.uProgress.value = 0;
      mat.uniforms.uTurb.value = 0;
      return;
    }

    mat.uniforms.uTime.value += delta;
    const { m, turb } = morphAt(mat.uniforms.uTime.value);
    mat.uniforms.uProgress.value = m;
    mat.uniforms.uTurb.value = turb;

    const tx = mouse.current.x * 0.25;
    const ty = mouse.current.y * 0.18;
    group.rotation.y += (tx - group.rotation.y) * Math.min(delta * 2, 1);
    group.rotation.x += (ty - group.rotation.x) * Math.min(delta * 2, 1);
  });

  return (
    <group ref={groupRef}>
      <points geometry={geometry}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

export default function WheelScene({ reduced = false }: { reduced?: boolean }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 7], fov: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%", display: "block" }}
      frameloop={reduced ? "demand" : "always"}
    >
      <FitToParent />
      <MorphPoints reduced={reduced} />
    </Canvas>
  );
}
