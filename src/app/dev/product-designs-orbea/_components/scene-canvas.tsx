'use client';

import * as React from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows, Stars, Float } from '@react-three/drei';
import { BikeMesh, type BikeMeshProps } from './bike-mesh';

type SceneCanvasProps = BikeMeshProps & {
  className?: string;
  showStars?: boolean;
  showFloat?: boolean;
  enableControls?: boolean;
  cameraPosition?: [number, number, number];
  fov?: number;
  ambient?: number;
  spotIntensity?: number;
  children?: React.ReactNode;
};

export function SceneCanvas({
  className,
  showStars = false,
  showFloat = false,
  enableControls = false,
  cameraPosition = [0, 0.6, 3.2],
  fov = 42,
  ambient = 0.45,
  spotIntensity = 1.2,
  children,
  ...bikeProps
}: SceneCanvasProps) {
  const bike = <BikeMesh {...bikeProps} />;

  return (
    <div className={className} style={{ width: '100%', height: '100%', background: 'transparent' }}>
      <Canvas
        camera={{ position: cameraPosition, fov }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['transparent']} />
        <ambientLight intensity={ambient} />
        <spotLight position={[4, 6, 4]} angle={0.35} penumbra={0.8} intensity={spotIntensity} castShadow />
        <spotLight position={[-5, 3, -2]} angle={0.4} penumbra={1} intensity={spotIntensity * 0.45} color="#7eb8da" />
        <directionalLight position={[-3, 2, 2]} intensity={0.35} />

        {showStars && <Stars radius={80} depth={40} count={1200} factor={3} saturation={0} fade speed={0.6} />}

        {showFloat ? (
          <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.35}>
            {bike}
          </Float>
        ) : (
          bike
        )}

        <ContactShadows position={[0, -0.38, 0]} opacity={0.55} scale={8} blur={2.5} far={4} />
        <Environment preset="city" />

        {enableControls && (
          <OrbitControls
            enablePan={false}
            minDistance={2}
            maxDistance={5.5}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 1.8}
            enableDamping
            dampingFactor={0.06}
          />
        )}

        {children}
      </Canvas>
    </div>
  );
}
