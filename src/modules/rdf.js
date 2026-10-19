// https://github.com/rdfjs/N3.js/ (repo)
// https://rdf.js.org/N3.js/ (docs)
// https://www.rubensworks.net/blog/2019/10/06/using-rdf-in-javascript/

import { Store } from "https://unpkg.com/n3/browser/n3.esm.min.js";

/** Maintains rdf store state */
export class RdfStore {
    #store;

    constructor() {
        this.#store = new Store();
    }
}
