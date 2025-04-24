# Étape 1 : Téléchargement du .pbf
FROM debian:bullseye AS downloader

RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /data

RUN curl -L --fail -o france.osm.pbf https://download.geofabrik.de/europe/france-latest.osm.pbf

# Étape 2 : Extraction OSRM avec faible consommation mémoire
FROM osrm/osrm-backend:latest AS builder

ENV OSRM_THREADS=2

COPY --from=downloader /data/france.osm.pbf /data/

RUN osrm-extract -p /opt/car.lua /data/france.osm.pbf --threads $OSRM_THREADS && \
    osrm-partition /data/france.osrm --threads $OSRM_THREADS && \
    osrm-customize /data/france.osrm --threads $OSRM_THREADS
