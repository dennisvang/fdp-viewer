import {ResourceViewer} from "./modules/viewer.js";

let viewer;

const inputUrl = document.getElementById("input-url");

// create new viewer when fdp url changes
inputUrl.addEventListener("change", async (event) => {
    const container = document.getElementById("content");
    viewer = new ResourceViewer(container, event.target.value);
    // (WIP)
    await viewer.init();
});

// initialize
inputUrl.dispatchEvent(new Event("change"));
