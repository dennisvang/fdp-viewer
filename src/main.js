import {ResourceViewer} from "./modules/viewer.js";

// todo: consistent naming IRI/URI/URL throughout all modules

let viewer;

const inputUrl = document.getElementById("input-url");

// create new viewer when fdp url changes
inputUrl.addEventListener("change", async (event) => {
    const container = document.getElementById("content");
    viewer = new ResourceViewer(container, event.target.value);
    // initialize rdf context
    await viewer.initialize();
    // populate page from root url
    await viewer.update();
});

// initialize
inputUrl.dispatchEvent(new Event("change"));
