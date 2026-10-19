import { RdfStore } from "./rdf.js";

/** Maintains resource viewer state */
export class ResourceViewer {
    // private elements
    #container;
    #rdfStore;
    #rootUrl;

    constructor(container, rootUrl) {
        this.#container = container;
        this.#rootUrl = rootUrl;
        this.#rdfStore = new RdfStore();
        console.debug("viewer created for %s", this.#rootUrl)
    }
}
