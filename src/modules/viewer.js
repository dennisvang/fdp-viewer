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
        // populate the content container based on the harvested resource
        await this.#populate(resourceUrl);
    }

    /** (WIP) */
    #createElementTitle(title) {
        // temp
        return document.createElement("div");
    }

    /** (WIP) */
    #createElementForStatement(quad) {
        // temp
        return document.createElement("div");
    }

    /**
     * Creates an HTML element containing all RDF statements for the given RDF subject
     */
    #createElementForSubject(url, subject) {
        const subjectElement = document.createElement("div");
        subjectElement.classList.add("subject");
        subjectElement.id = subject.id;
        subjectElement.appendChild(this.#createElementTitle(subject.id));
        this.#rdfStore.getQuadsForGraphSubject(url, subject).forEach(quad => {
            subjectElement.appendChild(this.#createElementForStatement(quad));
        });
        return subjectElement;
    }

    /**
     * Populates the content container based on statements from the RDF store about
     * the specified resource. The container is cleared first.
     */
    async #populate(url) {
        // clear
        this.#container.replaceChildren();
        // iterate over all rdf subjects from the graph for the specified resource url
        this.#rdfStore.getSubjectsForGraph(url).forEach(subject => {
            this.#container.appendChild(this.#createElementForSubject(url, subject));
        });
    }

    /**
     * Updates the RdfStore based on the RDF turtle representation harvested from the
     * specified URL. Each resource representation is stored in its own graph,
     * identified by the resource url.
     */
    async #harvest(url) {
        const turtle = await this.#requestTurtle(url);
        // todo: only call parseTurtle if the url is not in the rdf store yet
        await this.#rdfStore.parseTurtle(turtle, url);
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
