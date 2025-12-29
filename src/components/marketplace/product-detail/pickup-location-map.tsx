"use client";

import * as React from "react";
import { GoogleMap, Circle, useJsApiLoader } from "@react-google-maps/api";

// ============================================================
// Pickup Location Map Component
// Interactive map with privacy circle overlay
// ============================================================

interface PickupLocationMapProps {
  location: string;
  className?: string;
}

const mapContainerStyle = {
  width: "100%",
  height: "100%",
  borderRadius: "6px",
};

// Map styling - clean and minimal
const mapOptions: google.maps.MapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  clickableIcons: false,
  styles: [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "transit",
      stylers: [{ visibility: "off" }],
    },
  ],
};

// Yellow circle options for privacy overlay
const circleOptions: google.maps.CircleOptions = {
  strokeColor: "#EAB308",
  strokeOpacity: 0.5,
  strokeWeight: 2,
  fillColor: "#EAB308",
  fillOpacity: 0.2,
  clickable: false,
  draggable: false,
  editable: false,
};

export function PickupLocationMap({ location, className }: PickupLocationMapProps) {
  const [center, setCenter] = React.useState<{ lat: number; lng: number } | null>(null);
  const [isGeocoding, setIsGeocoding] = React.useState(true);
  const [error, setError] = React.useState(false);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries: ["places"],
  });

  // Geocode the location string to coordinates
  React.useEffect(() => {
    if (!isLoaded || !location) return;

    const geocoder = new google.maps.Geocoder();
    
    // Append ", Australia" to improve geocoding accuracy
    const searchLocation = location.toLowerCase().includes("australia") 
      ? location 
      : `${location}, Australia`;

    geocoder.geocode({ address: searchLocation }, (results, status) => {
      setIsGeocoding(false);
      
      if (status === "OK" && results && results[0]) {
        const { lat, lng } = results[0].geometry.location;
        setCenter({ lat: lat(), lng: lng() });
      } else {
        console.error("Geocoding failed:", status);
        setError(true);
      }
    });
  }, [isLoaded, location]);

  // Don't render if we can't load Google Maps or geocoding failed
  if (loadError || error || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return null;
  }

  // Show skeleton while loading
  if (!isLoaded || isGeocoding || !center) {
    return (
      <div className={`bg-gray-100 rounded-md animate-pulse ${className || "h-32"}`} />
    );
  }

  return (
    <div className={className || "h-32"}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={12}
        options={mapOptions}
      >
        {/* Privacy circle - 1.5km radius to obscure exact location */}
        <Circle
          center={center}
          radius={1500}
          options={circleOptions}
        />
      </GoogleMap>
    </div>
  );
}
