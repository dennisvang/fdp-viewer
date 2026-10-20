// https://github.com/rdfjs/N3.js/ (repo)
// https://rdf.js.org/N3.js/ (docs)
// https://www.rubensworks.net/blog/2019/10/06/using-rdf-in-javascript/

import { DataFactory, Parser, Store } from "https://unpkg.com/n3/browser/n3.esm.min.js";

const DCTERMS_HAS_PART = "http://purl.org/dc/terms/hasPart";
const DCTERMS_IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
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
     * Returns an array of IRIs representing parents and children of the specified
     * RDF subject.
     */
    getRelatedResourceIris(subjectIri) {
        const subject = DataFactory.namedNode(subjectIri);
        const children = store.getObjects(
            subject,
            DataFactory.namedNode(DCTERMS_HAS_PART),
            null,
        ).map(c => c.id);
        const parents = store.getObjects(
            subject,
            DataFactory.namedNode(DCTERMS_IS_PART_OF),
            null,
        ).map(p => p.id);
        // unique array of IRIs from parents and children
        return [... new Set([...children, ...parents])];
    }

    /**
     * Gets all RDF subjects from the specified resource's graph.
     */
    getSubjectsForGraph(graphUri) {
        return this.#store.getSubjects(null, null, DataFactory.namedNode(graphUri));
    }

    /**
     * Returns all RDF quads from the specified resource's graph matching the subject.
     */
    getQuadsForGraphSubject(graphUri, subject) {
        return this.#store.match(subject, null, null, DataFactory.namedNode(graphUri));
    }

    /** Returns all RDF objects matching the subject and predicate, from all graphs */
    getObjectsForSubjectAndPredicate(subject, predicate) {
        return this.#store.getObjects(subject, predicate, null);
    }

    /** Returns known prefixes (populated via parser) */
    getPrefixes() {
        return this.#prefixes;
    }
}
