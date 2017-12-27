const template = require('./index.mustache')
const model = require('./model.json')

function component() {
  const element = document.createElement('div');
  element.innerHTML = template(model)
  return element;
}

document.body.appendChild(component());
