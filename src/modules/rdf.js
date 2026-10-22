// https://github.com/rdfjs/N3.js/ (repo)
// https://rdf.js.org/N3.js/ (docs)
// https://www.rubensworks.net/blog/2019/10/06/using-rdf-in-javascript/

import { DataFactory, Parser, Reasoner, Store } from "https://unpkg.com/n3/browser/n3.esm.min.js";

export const MEDIATYPE_TURTLE = "text/turtle";

const DCTERMS_HAS_PART = "http://purl.org/dc/terms/hasPart";
const DCTERMS_IS_PART_OF = "http://purl.org/dc/terms/isPartOf";
const MEDIATYPE_N3 = "text/n3";

const INFERENCE_RULES = `
# infer subclass
{
  ?subject a ?object .
  ?object <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?otherObject .
} => {
  ?subject a ?otherObject .
} .

# infer subproperty
{
  ?subject ?predicate ?object .
  ?predicate <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> ?otherPredicate .
} => {
  ?subject ?otherPredicate ?object .
} .

# infer close match property (to handle fdp-o:metadataCatalog...)
{
  ?subject ?predicate ?object .
  ?predicate <http://www.w3.org/2004/02/skos/core#closeMatch> ?otherPredicate .
} => {
  ?subject ?otherPredicate ?object .
} .
`;

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
        const children = this.#store.getObjects(
            subject,
            DataFactory.namedNode(DCTERMS_HAS_PART),
            null,
        ).map(c => c.id);
        const parents = this.#store.getObjects(
            subject,
            DataFactory.namedNode(DCTERMS_IS_PART_OF),
            null,
        ).map(p => p.id);
        // unique array of IRIs from parents and children
        let uniqueIris = [... new Set([...children, ...parents])];
        // ugly workaround for trailing slash mismatch between rdf-subject and root URI
        if (!uniqueIris.length && subjectIri.endsWith("/")) {
            console.warn("using workaround for related resource iris")
            // recursive call without the trailing slash
            uniqueIris = this.getRelatedResourceIris(subjectIri.slice(0, -1));
        }
        return uniqueIris;
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

    /**
     * Applies reasoning to the rdf store, based on the specified
     *
     * Note that n3.js does not support reasoning over multiple graphs, so we need to
     * copy all quads from individual graphs into the default graph of a single new
     * triple store and reason over that. The resulting triples are then copied back
     * into the specified root graph in the main triple store.
     */
    reason(rootGraphUri) {
        // initialize reasoning components
        const rulesParser = new Parser({ format: MEDIATYPE_N3 });
        const rulesStore = new Store(rulesParser.parse(INFERENCE_RULES));
        const unionStore = new Store();
        const reasoner = new Reasoner(unionStore);

        // copy quads from all graphs into the default graph of the union store
        this.#store.forEach(quad => {
            unionStore.addQuad(
                quad.subject, quad.predicate, quad.object, DataFactory.defaultGraph()
            );
        });

        // apply reasoning based on the specified inference rules
        console.debug("union-store size before reasoning: " + unionStore.size);
        reasoner.reason(rulesStore);
        console.debug("union-store size after reasoning: " + unionStore.size);

        // copy relevant quads back into the specified graph in the main triple store
        // todo: improve efficiency if necessary
        const rootGraph = DataFactory.namedNode(rootGraphUri);
        const rootGraphSubjectIds = this.#store.getSubjects(null, null, rootGraph)
            .map(s => s.id);
        console.debug("store size before copying inferred quads: " + this.#store.size)
        unionStore.forEach(quad => {
            if (rootGraphSubjectIds.includes(quad.subject.id)) {
                const added = this.#store.addQuad(
                    quad.subject, quad.predicate, quad.object, rootGraph);
                if (added) {
                    console.debug(
                        "inferred statement: %s, %s, %s",
                        quad.subject.id, quad.predicate.id, quad.object.id
                    );
                }
            }
        });
        console.debug("store size after copying inferred quads: " + this.#store.size)
    }

    /**
     * Returns a list of unique URIs based on all named nodes in the store (except
     * graph terms). Same-origin URIs are excluded based on the specified rootUri.
     * Prefix base URIs are included, but not their individual term URIS. Non-prefix
     * cross-origin URIs are all included.
     */
    getUniqueUris(rootUri) {
        // add all prefixes
        const prefixUris = Object.values(this.#prefixes);
        const uniqueUris = new Set(prefixUris);
        // create a list of origins to skip (same-origin and prefix origins) this is
        // more robust than using the whole URI because it ignores the hash and path
        const excludedOrigins = [];
        for (const uri of [rootUri, ...prefixUris]) {
            const origin = new URL(uri).origin;
            excludedOrigins.push(origin);
        }
        // iterate over all terms in the store
        for (const quad of this.#store) {
            // check all quad terms except graph
            for (const termName of ["subject", "predicate", "object"]) {
                const term = quad[termName];
                // only consider named nodes and exclude same-origin (not interested)
                // and prefix origins (already present)
                if (term.termType === "NamedNode" && !excludedOrigins.includes(new URL(term.id).origin)) {
                    // remove any fragments
                    const termUrl = new URL(term.id);
                    termUrl.hash = "";
                    uniqueUris.add(termUrl.href);
                }
            }
        }
        return [...uniqueUris];
    }
}
