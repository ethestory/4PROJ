import React, { useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';

const startIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

const endIcon = new L.Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/149/149060.png",
  iconSize: [30, 30],
  iconAnchor: [15, 30]
});

function MapView() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [routeCoords, setRouteCoords] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [center, setCenter] = useState([46.5, 2.5]); // Centré sur la France

  const getCoordinates = async (place) => {
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: place,
        format: 'json',
        limit: 1
      }
    });

    if (!res.data.length) throw new Error(`Adresse introuvable : ${place}`);
    const { lat, lon } = res.data[0];
    return [parseFloat(lat), parseFloat(lon)];
  };

  const getRoute = async () => {
    try {
      if (!start || !end) {
        alert("Veuillez remplir les deux champs.");
        return;
      }

      const fromCoords = await getCoordinates(start);
      const toCoords = await getCoordinates(end);

      // On inverse les coordonnées ici (lon, lat)
      const from = `${fromCoords[1]},${fromCoords[0]}`;
      const to = `${toCoords[1]},${toCoords[0]}`;

      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/route`, {
        params: {
          start: from,
          end: to
        }
      });
console.log("👉 Réponse API:", response.data);
      const route = response.data.routes[0];
      const coords = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
      const steps = route.legs[0].steps.map(step => ({
        text: step.maneuver.instruction || "Étape",
        distance: step.distance.toFixed(0)
      }));

      setRouteCoords(coords);
      setInstructions(steps);
      setCenter(fromCoords);
    } catch (err) {
      console.error("Erreur API Trafine :", err.response?.data || err.message);
      alert("Erreur lors du calcul de l’itinéraire.");
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Départ"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="Arrivée"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
        <button onClick={getRoute}>Calculer</button>
      </div>

      <MapContainer center={center} zoom={7} style={{ height: '400px', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {routeCoords.length > 0 && (
          <>
            <Polyline positions={routeCoords} color="blue" />
            <Marker position={routeCoords[0]} icon={startIcon}>
              <Popup>Départ : {start}</Popup>
            </Marker>
            <Marker position={routeCoords[routeCoords.length - 1]} icon={endIcon}>
              <Popup>Arrivée : {end}</Popup>
            </Marker>
          </>
        )}
      </MapContainer>

      <div style={{ marginTop: '1rem' }}>
        <h3>Instructions de conduite :</h3>
        <ul>
          {instructions.map((step, idx) => (
            <li key={idx}>{step.text} ({step.distance} m)</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default MapView;
