import {ResourceViewer} from "./modules/viewer.js";

const container = document.getElementById("content");

let viewer;

// create new viewer when fdp url changes
container.addEventListener("change", (event) => {
    viewer = new ResourceViewer(container, event.target.value);
});

// initialize
container.dispatchEvent(new Event("change"));
