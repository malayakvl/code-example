<template>
  <div class="map-container">
    <div class="map-control-buttons">
      <div class="btn rounded-circle circle-info" @click="toggleInfo" v-bind:class="{'active': btnState.info }">
        <i class="fas fa-info"></i>
      </div>
      <div class="btn rounded-circle" @click="toggleLayer" v-bind:class="{'active': btnState.layer }">
        <i class="fas fa-layer-group"></i>
      </div>
      <div class="btn rounded-circle" @click="toggleSatellite" v-bind:class="{'active': btnState.satellite }">
        <i class="fas fa-satellite"></i>
      </div>
      <div class="btn rounded-circle" @click="toggleDrawMode" v-bind:class="{'active': btnState.draw }">
        <i class="fas fa-draw-polygon"></i>
      </div>
      <div class="btn rounded-circle" @click="eraserPolygon">
        <i class="fas fa-eraser"></i>
      </div>
      <div class="btn rounded-circle" @click="zoomOut">
        <i class="fas fa-minus"></i>
      </div>
      <div class="btn rounded-circle" @click="zoomIn">
        <i class="fas fa-plus"></i>
      </div>
    </div>
    <div class="left-control-block">
      <MapLegend :map="map" v-if="isMapLoading" v-show="showLayerBlock" />

      <MapInfo
        :map="map"
        :marker="marker"
        :coord="coord"
        :areaCoord="areaCoord"
        :layers="mapLayers"
        :zoom="currentZoom"
        :drawMode="drawMode"
        :mapLayers="mapLayers"
        v-if="isMapLoading"
        v-show="showInfoBlock"
      />
    </div>
    <div id="map" class="map"></div>
  </div>
</template>
<script>
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import MapLegend from "@/components/map/MapLegend.vue";
import MapInfo from "@/components/map/MapInfo.vue";
import { renderStyle } from "./services/render";

const draw = new MapboxDraw({
  displayControlsDefault: false,
  defaultMode: 'simple_select',
});

export default {
  name: "OpenLayersMap",
  components: {
    MapLegend,
    MapInfo,
  },
  props: {},
  data: () => ({
    centreByDefault: null,
    selected: null,
    loading: false,
    location: "",
    access_token: process.env.VUE_APP_MAPBOX_TOKEN,
    center: [46.841812011386025, 24.89057298263615],
    map: {},
    tileUrl: process.env.VUE_APP_API_URI,
    isMapLoading: false,
    showLayerBlock: true,
    showInfoBlock: false,
    coord: {},
    areaCoord: [],
    currentZoom: "",
    marker: null,
    mapLayers: [],
    drawMode: 'simple_select',
    btnState: {layer: true, info: false, satellite: false, draw: false}
  }),
  computed: {
  },
  async mounted() {
    this.createMap();
  },
  methods: {
    eraserPolygon() {
      this.drawMode = "simple_select";
      draw.deleteAll();
    },
    toggleLayer() {
      const btnState = this.btnState;
      btnState.layer = !btnState.layer;
      this.btnState = btnState;
      this.showLayerBlock = !this.showLayerBlock;
    },
    toggleInfo() {
      const btnState = this.btnState;
      btnState.info = !btnState.info;
      this.btnState = btnState;
      this.showInfoBlock =!this.showInfoBlock;
    },
    toggleDrawMode() {
      const btnState = this.btnState;
      if (this.drawMode === "simple_select") {
        this.drawMode = "draw_polygon";
        btnState.draw = true;
      } else {
        this.drawMode = "simple_select";
        btnState.draw = false;
      }
      this.btnState = btnState;
      draw.changeMode(this.drawMode);
    },
    zoomOut() {
      let zoomLevel = this.map.getZoom();
      if (zoomLevel < 7) {
        zoomLevel = 6;
      } else {
        zoomLevel--;
      }
      this.map.zoomTo(zoomLevel, { duration: 2000 });
    },
    zoomIn() {
      let zoomLevel = this.map.getZoom();
      if (zoomLevel > 17) {
        zoomLevel = 17.8;
      } else {
        zoomLevel++;
      }
      this.map.zoomTo(zoomLevel, { duration: 2000 });
    },
    toggleSatellite() {
      const visibility = this.map.getLayoutProperty(
        "satellite",
        "visibility"
      );
      const btnState = this.btnState;
      if (visibility === "visible") {
        this.map.setLayoutProperty("satellite", "visibility", "none");
        btnState.satellite = false;
      } else {
        this.map.setLayoutProperty("satellite", "visibility", "visible");
        btnState.satellite = true;
      }
      this.btnState = btnState;
    },
    async createMap() {
      try {
        mapboxgl.accessToken = this.access_token;
        this.map = new mapboxgl.Map({
          container: "map",
          antialias: true,
          style: `mapbox://styles/mapbox/light-v10?optimize=true`,
          minZoom: 6,
          maxZoom: 17.8,
          zoom: 14,
          center: this.center,
          localIdeographFontFamily: "sans-serif",
          maxTileCacheSize: 100000,
          refreshExpiredTiles: true,
        });

        this.map.addControl(draw);
        const self = this
        this.map.on("load", () => {
          this.getLayerForRender();

          self.map.on("click", function (e) {
            self.coord = e.lngLat;
            if (self.drawMode === "simple_select") {
              self.$store.commit('loaderShow');
            }
            self.showInfoBlock = true;
            const btnState = self.btnState;
            btnState.info = true;
            self.btnState = btnState;
          });

          self.map.on('draw.create', function () {
            self.$store.commit('loaderShow');
            self.areaCoord = draw.getAll().features[0].geometry;
          });

          self.map.on('idle', function () {
            if (self.map.loaded() /*&& self.$store.state.checkedLayers.length*/) {
              self.$store.commit('loaderHide');
              self.map.off('idle');
            }
          });
        });

        this.map.on('zoomend', function () {
        });

        this.map.on('sourcedata', function (e) {
          if (e.isSourceLoaded && e.sourceId !== 'mapbox-gl-draw-hot') {
            let layerKey = '';
            if (e.sourceDataType) {
              layerKey = e.sourceId;
            } else if (e.tile && e.sourceId !== 'composite') {
              layerKey = `${e.sourceId}_tile`;
            } else if (e.sourceId === 'composite') {
              layerKey = 'composite';
            }
            self.$store.commit('removeLayer', layerKey);
            if (self.$store.state.checkedLayers.length === 0) {
              self.$store.commit('loaderHide');
            }
          }
        });
      } catch (err) {
        console.log("map error", err);
      }
    },
    async getLayerForRender() {
      this.$store.commit('loaderShow');
      const res = await fetch(`/api/get-render`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        const schemaStyle = await renderStyle(data.layers, this.tileUrl);
        this.mapLayers = data.layers;
        this.map.getCanvas().style.cursor = "pointer";

        this.map.flyTo({
          center: data.settings.center,
          essential: true,
          zoom: data.settings.zoom
        });
        let layerSource;
        for (let j = 0; j < schemaStyle.sources.length; j++) {
          if (!this.map.getSource(schemaStyle.sources[j].id)) {
            this.map.addSource(
              schemaStyle.sources[j].id,
              schemaStyle.sources[j].src
            );
          }
          layerSource = schemaStyle.sources[j].id;
        }

        for (let i = 0; i < schemaStyle.layers.length; i++) {
          const layer = schemaStyle.layers[i];
          let layerVisibility = layer.visibility;
          if (layerVisibility === 'visible') {
            this.$store.commit('loaderShow');
            this.$store.commit('addCheckedLayer', layerSource);
          }

          for (let j = 0; j < layer.sublayers.length; j++) {
            if (!this.map.getLayer(layer.sublayers[j].id)) {
              this.map.addLayer(layer.sublayers[j]);
            }
            this.map.setLayoutProperty(
              layer.sublayers[j].id,
              "visibility",
              layerVisibility
            );
          }
        }
        data.layers.forEach(element => {
          this.$store.state.elementLayersState[element.name] = element.visibility === 'visible';
        });
        this.isMapLoading = true;
        if (this.$store.state.checkedLayers.length === 0) {
          this.$store.commit('loaderHide');
        }
      }
    },
  },
};
</script>

<style scoped>
#map,
.map-container {
  height: 100%;
}

.map-container {
  position: relative;
  overflow: hidden;
}
</style>
