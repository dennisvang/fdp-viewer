import { MEDIATYPE_TURTLE, RdfStore } from "./rdf.js";

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

    /** (WIP) */
    async update(url) {
        // fall back on root url if no url was provided
        const resourceUrl = url ? url : this.#rootUrl;
        // harvest resource statements and add them to the rdf store
        await this.#harvest(resourceUrl);
    }

    /**
     * Updates the RdfStore based on the RDF turtle representation harvested from the
     * specified URL.
     */
    async #harvest(url) {
        const turtle = await this.#requestTurtle(url);
        await this.#rdfStore.parseTurtle(turtle);
    }

    /** Executes an HTTP GET request for RDF turtle and returns the response body as text */
    async #requestTurtle(url) {
        // enforce https
        url = url.replace("http://", "https://");
        // specify options to get rdf-turtle
        const options = {
            method: "GET",
            headers: {"accept": MEDIATYPE_TURTLE},
        };
        // generic fetch request
        console.debug("fetching %s from %s", options.headers.accept, url);
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        console.debug("got success response from %s", url);
        return await response.text();
    }
}
