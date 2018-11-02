// import _ from "lodash"; // not using this right now but maybe we will
import $ from "jQuery";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw";
import { format } from "d3-format";
import { json } from "d3-fetch";
import { ckmeans } from "simple-statistics";

import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import "./style.css";

// Locally Scoped Object Module Pattern
// more info: https://toddmotto.com/mastering-the-module-pattern/#locally-scoped-object-literal
const ATD_DocklessMap = (function() {
  // Let this empty object be the placeholder to attach public methods.
  let docklessMap = {};

  docklessMap.mapOptions = {
    container: "map",
    style: "mapbox://styles/mapbox/light-v9",
    center: [-97.74, 30.275],
    zoom: 13,
    minZoom: 1,
    maxZoom: 19
  };

  // Attach public methods like this using object literal notation.
  docklessMap.init = function() {
    console.log("initializing");
    this.$ui = $("#js");

    setHeight("#map-container");
    initalizeMap();
    runAppCode();
    registerEventHandlers();
  };

  const initalizeMap = () => {
    docklessMap.API_URL = "http://localhost:8000/v1/trips";
    mapboxgl.accessToken =
      "pk.eyJ1Ijoiam9obmNsYXJ5IiwiYSI6ImNqbjhkZ25vcjF2eTMzbG52dGRlbnVqOHAifQ.y1xhnHxbB6KlpQgTp1g1Ow";
    docklessMap.map = new mapboxgl.Map(docklessMap.mapOptions);

    // add nav
    var nav = new mapboxgl.NavigationControl();
    docklessMap.map.addControl(nav, "top-left");

    // add drawing
    var drawOptions = {
      controls: {
        trash: false,
        line_string: false,
        combine_features: false,
        uncombine_features: false
      }
    };
    docklessMap.Draw = new MapboxDraw(drawOptions);
    docklessMap.map.addControl(docklessMap.Draw, "top-left");
  };

  // TODO: Break this down into smaller pieces
  const runAppCode = () => {
    var formatPct = format(".1%");
    var formatKs = format(",");

    var total_trips;
    var data;
    var flow;
    var first = true;

    // do magic
    docklessMap.map.on("load", function() {
      console.log("do magic");
      var url;

      flow = $("#flowSelector option:selected").val();

      $("#flowSelector").change(function() {
        var previousFlow = flow;

        flow = $("#flowSelector option:selected").val();

        if (docklessMap.map.getLayer("feature_layer")) {
          var visibility = docklessMap.map.getLayoutProperty(
            "feature_layer",
            "visibility"
          );

          // if showing feature layer, update layer with new flow
          if (visibility === "visible") {
            url = url.replace(previousFlow, flow);
            showLoader();
            getData(url);
            removeStats();
          }
        }
      });

      docklessMap.map.on("draw.create", function(e) {
        showLoader();
        url = getUrl(e.features, flow);
        console.log(url);
        getData(url);
        removeStats();
      });

      docklessMap.map.on("draw.update", function(e) {
        showLoader();
        url = getUrl(e.features, flow);
        getData(url);
        removeStats();
      });

      docklessMap.map.on("click", "feature_layer", function(e) {
        postCellTripCount(e.features[0]);
      });

      // Change the cursor to a pointer when the mouse is over the states layer.
      docklessMap.map.on("mouseenter", "feature_layer", function() {
        docklessMap.map.getCanvas().style.cursor = "pointer";
      });

      // Change it back to a pointer when it leaves.
      docklessMap.map.on("mouseleave", "feature_layer", function() {
        docklessMap.map.getCanvas().style.cursor = "";
      });

      function getUrl(features, flow) {
        var coordinates = features[0].geometry.coordinates.toString();

        var url = docklessMap.API_URL + "?xy=" + coordinates + "&flow=" + flow;
        return url;
      }
    });

    function addFeatures(features, reference_features, total_trips) {
      if (first) {
        docklessMap.map.addLayer({
          id: "feature_layer",
          type: "fill-extrusion",
          source: {
            type: "geojson",
            data: features
          },
          layout: {},
          paint: {
            "fill-extrusion-color": getPaint(features.features),

            "fill-extrusion-height": [
              "*",
              ["number", ["get", "current_count"]],
              1
            ],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.7
          }
        });

        docklessMap.map.addLayer({
          id: "reference_layer",
          type: "line",
          source: {
            type: "geojson",
            data: reference_features
          },
          layout: {
            "line-cap": "round",
            "line-join": "round"
          },
          paint: {
            "line-color": "#000",
            "line-opacity": 0.4,
            "line-width": 3,
            "line-dasharray": [3, 3]
          }
        });

        showLayer("feature_layer", true);
        showLayer("reference_layer", true);
        hideLoader();
        postTrips(total_trips);
        first = false;
      } else {
        updateLayers(features, reference_features, total_trips);
      }
    }

    function updateLayers(features, reference_features, total_trips) {
      docklessMap.map.getSource("reference_layer").setData(reference_features);
      docklessMap.map.getSource("feature_layer").setData(features);
      docklessMap.map.setPaintProperty(
        "feature_layer",
        "fill-extrusion-color",
        getPaint(features.features)
      );
      showLayer("feature_layer", true);
      showLayer("reference_layer", true);
      hideLoader();
      postTrips(total_trips);
    }

    function getData(url) {
      json(url).then(function(json) {
        docklessMap.Draw.deleteAll();
        total_trips = json.total_trips;
        addFeatures(json.features, json.intersect_feature, json.total_trips);
      });
    }

    function postCellTripCount(feature, divId = "dataPane") {
      var trip_percent = feature.properties.current_count / total_trips;

      if (flow == "origin") {
        var text =
          formatKs(feature.properties.current_count) +
          " (" +
          formatPct(trip_percent) +
          ") trips originated in the clicked cell.";
      } else if (flow == "destination") {
        var text =
          formatKs(feature.properties.current_count) +
          " (" +
          formatPct(trip_percent) +
          ") trips terminated in the clicked cell.";
      }

      var html =
        '<div id="cellTripCount" class="alert alert-dark stats" role="alert">' +
        text +
        "</div>";

      $("#cellTripCount").remove();
      $("#dataPane").append(html);
    }

    const showLayer = (layer_name, show_layer) => {
      if (!show_layer) {
        docklessMap.map.setLayoutProperty(layer_name, "visibility", "none");
      } else {
        docklessMap.map.setLayoutProperty(layer_name, "visibility", "visible");
      }
    };

    function getPaint(features) {
      let breaks = jenksBreaks(features);

      return [
        "interpolate",
        ["linear"],
        ["number", ["get", "current_count"]],
        breaks[0][0] - 1,
        "#ffeda0",
        breaks[1][0] - 1,
        "#fed976",
        breaks[2][0] - 1,
        "#fd8d3c",
        breaks[3][0] - 1,
        "#e31a1c",
        breaks[4][0],
        "#800026"
      ];
    }

    function postTrips(total_trips, divId = "dataPane") {
      if (flow == "origin") {
        var text =
          formatKs(total_trips) + " trips terminated in the selected area.";
      } else if (flow == "destination") {
        var text =
          formatKs(total_trips) + " trips originated in the selected area.";
      }

      var html =
        '<div id="tripAlert" class="alert alert-primary stats" role="alert">' +
        text +
        "</div>";

      $("#tripAlert").remove();
      $("#cellTripCount").remove();
      $("#" + divId).append(html);
    }

    function showLoader(divId = "dataPane") {
      var html = '<p class="loader">Loading...</p>';
      $("#" + divId).append(html);
    }

    function hideLoader(divId = "dataPane") {
      $(".loader").remove();
    }

    function jenksBreaks(features) {
      return ckmeans(features.map(f => f.properties.current_count), 5);
    }
  };

  // All methods declared with `const`, must be "private" and are scoped
  const registerEventHandlers = () => {
    console.log("registering events");
    clearMapOnEscEvent();
  };

  const setHeight = selector => {
    var height = $(window).height();
    $(selector).css("height", height);
  };

  const clearMapOnEscEvent = () => {
    $(document).keyup(function(e) {
      if (e.keyCode === 27) {
        showLayer("feature_layer", false);
        showLayer("reference_layer", false);
        removeStats();
      }
    });
  };

  const showLayer = (layer_name, show_layer) => {
    if (!show_layer) {
      docklessMap.map.setLayoutProperty(layer_name, "visibility", "none");
    } else {
      docklessMap.map.setLayoutProperty(layer_name, "visibility", "visible");
    }
  };

  const removeStats = (selector = "stats") => {
    $("." + selector).remove();
  };

  return docklessMap;
})();

ATD_DocklessMap.init();
