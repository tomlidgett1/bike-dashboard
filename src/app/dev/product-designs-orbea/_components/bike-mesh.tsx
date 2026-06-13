'use client';

import * as React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export type BikeVariant = 'road' | 'mtb' | 'gravel';

export type BikeMeshProps = {
  frameColor?: string;
  accentColor?: string;
  wireframe?: boolean;
  opacity?: number;
  autoRotate?: boolean;
  rotateSpeed?: number;
  scale?: number;
  variant?: BikeVariant;
  highlightPart?: 'frame' | 'wheels' | 'drivetrain' | null;
};

function Tube({
  from,
  to,
  radius,
  color,
  wireframe,
  opacity = 1,
  emissive,
}: {
  from: [number, number, number];
  to: [number, number, number];
  radius: number;
  color: string;
  wireframe?: boolean;
  opacity?: number;
  emissive?: string;
}) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const axis = end.clone().sub(start);
  const len = axis.length();
  const mid = start.clone().add(axis.clone().multiplyScalar(0.5));
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis.normalize(),
  );

  return (
    <mesh position={mid.toArray()} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, len, 12, 1, wireframe]} />
      <meshStandardMaterial
        color={color}
        wireframe={wireframe}
        transparent={opacity < 1}
        opacity={opacity}
        metalness={wireframe ? 0 : 0.65}
        roughness={wireframe ? 0.3 : 0.25}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? 0.35 : 0}
      />
    </mesh>
  );
}

function Wheel({
  position,
  radius,
  color,
  wireframe,
  opacity,
  highlight,
}: {
  position: [number, number, number];
  radius: number;
  color: string;
  wireframe?: boolean;
  opacity?: number;
  highlight?: boolean;
}) {
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[radius, 0.018, 10, 48]} />
        <meshStandardMaterial
          color={highlight ? '#ffde59' : color}
          wireframe={wireframe}
          transparent={(opacity ?? 1) < 1}
          opacity={opacity ?? 1}
          metalness={0.8}
          roughness={0.2}
          emissive={highlight ? '#ffde59' : '#000000'}
          emissiveIntensity={highlight ? 0.25 : 0}
        />
      </mesh>
      {[...Array(8)].map((_, i) => (
        <mesh key={i} rotation={[0, (Math.PI * 2 * i) / 8, Math.PI / 2]}>
          <boxGeometry args={[0.012, radius * 1.85, 0.004]} />
          <meshStandardMaterial color="#888" wireframe={wireframe} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function BikeMesh({
  frameColor = '#1a1a1a',
  accentColor = '#e63946',
  wireframe = false,
  opacity = 1,
  autoRotate = true,
  rotateSpeed = 0.35,
  scale = 1,
  variant = 'road',
  highlightPart = null,
}: BikeMeshProps) {
  const group = React.useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (autoRotate && group.current) {
      group.current.rotation.y += delta * rotateSpeed;
    }
  });

  const drop = variant === 'mtb' ? 0.08 : variant === 'gravel' ? 0.05 : 0.02;
  const frameEmissive = highlightPart === 'frame' ? accentColor : undefined;
  const wheelHighlight = highlightPart === 'wheels';
  const driveHighlight = highlightPart === 'drivetrain';

  return (
    <group ref={group} scale={scale} position={[0, -0.35, 0]}>
      {/* Rear triangle */}
      <Tube from={[-0.55, 0.35, 0]} to={[0, 0.75, 0]} radius={0.022} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />
      <Tube from={[0, 0.75, 0]} to={[0.62, 0.35, 0]} radius={0.022} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />
      <Tube from={[-0.55, 0.35, 0]} to={[0.62, 0.35, 0]} radius={0.018} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />

      {/* Top / down tubes */}
      <Tube from={[-0.55, 0.35, 0]} to={[0.15, 0.95, drop]} radius={0.024} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />
      <Tube from={[0.15, 0.95, drop]} to={[0.62, 0.35, 0]} radius={0.026} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />

      {/* Seat tube & post */}
      <Tube from={[0, 0.75, 0]} to={[0, 1.05, drop * 0.5]} radius={0.018} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />
      <Tube from={[0, 1.05, drop * 0.5]} to={[0, 1.22, drop * 0.5]} radius={0.008} color="#333" wireframe={wireframe} opacity={opacity} />

      {/* Fork */}
      <Tube from={[0.62, 0.35, 0]} to={[0.78, 0.92, drop]} radius={0.014} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />
      <Tube from={[0.62, 0.35, 0]} to={[0.78, 0.92, -drop]} radius={0.014} color={frameColor} wireframe={wireframe} opacity={opacity} emissive={frameEmissive} />

      {/* Handlebar */}
      <Tube from={[0.78, 0.92, drop]} to={[0.78, 1.0, drop]} radius={0.006} color="#444" wireframe={wireframe} opacity={opacity} />
      <Tube from={[0.78, 1.0, drop - 0.12]} to={[0.78, 1.0, drop + 0.12]} radius={0.006} color="#444" wireframe={wireframe} opacity={opacity} />

      {/* Wheels */}
      <Wheel position={[-0.55, 0.35, 0]} radius={0.34} color="#222" wireframe={wireframe} opacity={opacity} highlight={wheelHighlight} />
      <Wheel position={[0.62, 0.35, 0]} radius={0.34} color="#222" wireframe={wireframe} opacity={opacity} highlight={wheelHighlight} />

      {/* Crank / chainring */}
      <mesh position={[0, 0.55, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.012, 8, 32]} />
        <meshStandardMaterial
          color={driveHighlight ? accentColor : '#666'}
          wireframe={wireframe}
          metalness={0.9}
          roughness={0.15}
          emissive={driveHighlight ? accentColor : '#000000'}
          emissiveIntensity={driveHighlight ? 0.4 : 0}
        />
      </mesh>

      {/* Accent badge — Orbea-style seat cluster */}
      <mesh position={[0, 0.78, 0.025]}>
        <sphereGeometry args={[0.028, 16, 16]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={0.5} metalness={0.3} roughness={0.4} />
      </mesh>
    </group>
  );
}
