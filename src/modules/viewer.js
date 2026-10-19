/** Maintains resource viewer state */
export class ResourceViewer {
    // private elements
    #container;
    #rootUrl;

    constructor(container, rootUrl) {
        this.#container = container;
        this.#rootUrl = rootUrl;
        console.debug("viewer created for %s", this.#rootUrl)
    }
}
