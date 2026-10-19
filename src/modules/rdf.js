// https://github.com/rdfjs/N3.js/ (repo)
// https://rdf.js.org/N3.js/ (docs)
// https://www.rubensworks.net/blog/2019/10/06/using-rdf-in-javascript/

import { DataFactory, Parser, Store } from "https://unpkg.com/n3/browser/n3.esm.min.js";

export const MEDIATYPE_TURTLE = "text/turtle";

/** Maintains rdf store state */
export class RdfStore {
    #prefixes;
    #store;

    constructor() {
        this.#prefixes = {};
        this.#store = new Store();
    }

    /**
     * Parses an RDF turtle string into the triple store using the specified uri as
     * graph uri. Also updates the #prefixes object.
     */
    async parseTurtle(turtle, uri) {
        // use a dedicated graph for each parsed uri
        const graph = uri ? DataFactory.namedNode(uri) : DataFactory.defaultGraph();
        // note that the use of parse() callbacks makes this asynchronous,
        // but we need them so we can recurse when finding a prefix)
        const turtleParser = new Parser({ format: MEDIATYPE_TURTLE });
        turtleParser.parse(turtle, {
            onQuad: (error, quad) => {
                if (quad) {
                    const newQuad = DataFactory.quad(
                        quad.subject, quad.predicate, quad.object, graph
                    );
                    this.#store.add(newQuad);
                    console.debug("added to store: %s (graph: %s)", newQuad.subject.id, newQuad.graph.id);
                }
                if (error) {
                    console.warn("failed to parse quad for %s:\n%s", uri, error);
                }
            },
            onPrefix: (prefix, iri) => {
                this.#prefixes[prefix] = iri.id;
            },
        });
    }

    /**
     * Applies the specified callback to all RDF subjects in the resource's graph.
     * The callback must accept a single RDF subject, e.g. (subject) => { ... }.
     */
    forEachResourceSubject(resourceUri, subjectCallback) {
        const resourceGraph = DataFactory.namedNode(resourceUri);
        this.#store.forSubjects(subjectCallback, null, null, resourceGraph);
    }
}
