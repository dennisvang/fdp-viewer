// use <script type="module" ...> to ensure page is loaded (instead of load event)

const parser = new N3.Parser();
const url = document.querySelector("#url").value;
console.log(url);
const ttl = await getTurtle(url);
console.log(ttl);
const quads = parser.parse(ttl);


async function getTurtle(url) {
    // get ttl from url
    const requestOptions = {
        method: 'GET',
        headers: {'Accept': 'text/turtle'},
    };
    return await makeRequest(url, requestOptions);
}

async function makeRequest(url, options) {
    // generic fetch request with error handling
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.log(error);
    }
}