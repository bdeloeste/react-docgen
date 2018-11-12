const path = require('path');
const fs = require('fs');
const rdg = require('./dist/main');
const externalFlowtypesHandler = require('./external-flowtypes-handler')
  .default;
const resolver = rdg.defaultResolver;
const handlers = rdg.defaultHandlers;

function resolve(...paths) {
  return fs.realpathSync(path.join(__dirname, ...paths));
}

const flowComponentPath = resolve('example', 'components', 'FlowComponent.js');

fs.readFile(flowComponentPath, 'utf-8', (err, contents) => {
  const newHandlers = [...handlers, externalFlowtypesHandler];
  const content = rdg.parse(contents, resolver, newHandlers);
  console.log(content);
});
