const tomAndJerry = `PREFIX c: <http://example.org/cartoons#>
  # Tom is a cat
  c:Tom a c:Cat.
  c:Jerry a c:Mouse;
    c:smarterThan c:Tom.`

window.onload = (event) => {
    const parser = new N3.Parser();

    parser.parse(tomAndJerry,
        (error, quad, prefixes) => {
            if (quad)
                console.log(quad);
            else
                console.log("# That's all, folks!", prefixes);
        });
};
