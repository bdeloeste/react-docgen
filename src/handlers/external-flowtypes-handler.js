const path = require('path');
const fs = require('fs');
const recast = require('recast');

/**
 * Re-using few private methods of react-docgen to avoid code dupilcation
 */
const setPropDescription = require(`react-docgen/dist/utils/setPropDescription`)
  .default;
const babylon = require(`react-docgen/dist/babylon`).default;

const HOP = Object.prototype.hasOwnProperty;
const createObject = Object.create;

/**
 * Accepts absolute path of a source file and returns the file source as string.
 * @method getSrc
 * @param  {String} filePath  File path of the component
 * @return {String} Source code of the given file if file exist else returns empty
 */
function getSrc(filePath) {
  let src;

  if (fs.existsSync(filePath)) {
    src = fs.readFileSync(filePath, 'utf-8');
  }

  return src;
}

function getAST(src) {
  return recast.parse(src, {
    source: 'module',
    esprima: babylon,
  });
}

/**
 * Resolves propTypes source file path relative to current component,
 * which resolves only file extension of type .js or .jsx
 *
 * @method resolveFilePath
 * @param  {String} componentPath  Relative file path of the component
 * @param  {String} importedFilePath Relative file path of a dependent component
 * @return {String} Resolved file path if file exist else null
 */
function resolveFilePath(componentPath, importedFilePath) {
  const regEx = /\.(js|jsx)$/;
  let srcPath = path.resolve(path.dirname(componentPath), importedFilePath);

  if (regEx.exec(srcPath)) {
    return srcPath;
  } else {
    srcPath += fs.existsSync(`${srcPath}.js`) ? '.js' : '.jsx';
    return srcPath;
  }
}

/**
 * Method which returns actual values from the AST node of type specifiers.
 *
 * @method getSpecifiersOfNode
 */
function getSpecifiersOfNode(specifiers) {
  const specifier = [];

  specifiers.forEach(node => {
    specifier.push(node.local.name);
  });

  return specifier;
}

/**
 * Filters the list of identifier node values or node paths from a given AST.
 *
 * @method getIdentifiers
 * @param  {Object} ast Root AST node of a component
 * @return {Object} Which holds identifier relative file path as `key` and identifier name as `value`
 */
function getIdentifiers(ast) {
  const identifiers = createObject(null);

  recast.visit(ast, {
    visitVariableDeclarator(path) {
      const node = path.node;
      const nodeType = node.init.type;

      if (nodeType === types.Identifier.name) {
        if (identifiers[node.init.name]) {
          identifiers[node.init.name].push(node.init.name);
        } else {
          identifiers[node.init.name] = [node.init.name];
        }
      } else if (nodeType === types.Literal.name) {
        if (identifiers[node.id.name]) {
          identifiers[node.id.name].push(node.init.value);
        } else {
          identifiers[node.id.name] = [node.init.value];
        }
      } else if (nodeType === types.ArrayExpression.name) {
        if (identifiers[node.id.name]) {
          identifiers[node.id.name].push(node.init.elements);
        } else {
          identifiers[node.id.name] = node.init.elements;
        }
      } else if (nodeType === types.ObjectExpression.name) {
        if (identifiers[node.id.name]) {
          identifiers[node.id.name].push({
            path,
            value: node.init.properties,
          });
        } else {
          identifiers[node.id.name] = {
            path,
            value: node.init.properties,
          };
        }
      }

      this.traverse(path);
    },
  });

  return identifiers;
}

/**
 * Traverse through given AST and filters named and default export declarations.
 *
 * @method getExports
 * @param  {Object} ast Root AST node of a component
 * @return {Array} which holds list of named identifiers
 */
function getExports(ast) {
  const exports = [];

  recast.visit(ast, {
    visitExportNamedDeclaration(path) {
      const node = path.node;
      const specifiers = getSpecifiersOfNode(node.specifiers);
      const declarations = Object.keys(getIdentifiers(ast));

      exports.push(...new Set(specifiers.concat(declarations)));
      this.traverse(path);
    },
    visitExportDefaultDeclaration(path) {
      const node = path.node;

      if (node.declaration.type === types.Identifier.name) {
        exports.push(node.declaration.name);
      }
      /* Commenting it for now, this might needed for further enchancements.
      else if (nodeType === types.Literal.name) {
        varDeclarators.push(node.init.value);
      } else if (nodeType === types.ArrayExpression.name) {
        computedPropNodes[node.id.name] = node.init.elements;
      }*/
      this.traverse(path);
    },
  });

  return exports;
}

/**
 * Method to list all specifiers of es6 `import` of a given file(AST)
 *
 * @method getImports
 * @param  {Object} ast Root AST node of a component
 * @return {Object/Boolean} if Object: Holds import module name or file path as `key`
 *                          and identifier as `value`, else return false
 */
function getImports(ast) {
  const specifiers = createObject(null);

  recast.visit(ast, {
    visitImportDeclaration: path => {
      const name = path.node.source.value;
      const specifier = getSpecifiersOfNode(path.node.specifiers);

      if (!specifiers[name]) {
        specifiers[name] = specifier;
      } else {
        specifiers[name].push(...specifier);
      }

      return false;
    },
  });

  return specifiers;
}

/**
 * Method to resolve all dependent values(computed values, which are from external files).
 *
 * @method resolveImportedDepedencies
 * @param  {Object} ast Root AST node of the component
 * @param  {Object} srcFilePath Absolute path of a dependent file
 * @return {Object} Holds export identifier as `key` and respective AST node path as value
 */
function resolveImportedDepedencies(ast, srcFilePath) {
  const filteredItems = createObject(null);
  const importSpecifiers = getImports(ast);

  let identifiers, reolvedNodes;

  if (importSpecifiers && Object.keys(importSpecifiers).length) {
    reolvedNodes = resolveDependencies(importSpecifiers, srcFilePath);
  }

  const exportSpecifiers = getExports(ast);

  if (exportSpecifiers && exportSpecifiers.length) {
    identifiers = getIdentifiers(ast);
  }

  if (reolvedNodes) {
    Object.assign(identifiers, ...reolvedNodes);
  }

  for (const identifier in identifiers) {
    if (
      HOP.call(identifiers, identifier) &&
      exportSpecifiers.indexOf(identifier) > -1
    ) {
      filteredItems[identifier] = identifiers[identifier];
    }
  }

  return filteredItems;
}

/**
 * Method to resolve all the external depedencies of the component propTypes
 *
 * @method resolveDependencies
 * @param  {Array} filePaths List of files to resolve
 * @param  {String} componentPath Absolute path of the component in case `propTypes` are declared in a component file or
 *                  absolute path to the file where `propTypes` is declared.
 */
function resolveDependencies(filePaths, componentPath) {
  const importedNodes = [];

  for (const importedFilePath in filePaths) {
    if (HOP.call(filePaths, importedFilePath)) {
      const srcPath = resolveFilePath(componentPath, importedFilePath);

      if (!srcPath) {
        return;
      }

      const src = getSrc(srcPath);

      if (src) {
        const ast = getAST(src);
        importedNodes.push(resolveImportedDepedencies(ast, srcPath));
      }
    }
  }

  return importedNodes;
}

/*
 * Copyright (c) 2015, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 *
 */
import getFlowType from './src/utils/getFlowType';
import getPropertyName from './src/utils/getPropertyName';
import getFlowTypeFromReactComponent, {
  applyToFlowTypeProperties,
} from './src/utils/getFlowTypeFromReactComponent';
import resolveToValue from './src/utils/resolveToValue';
import {
  isSupportedUtilityType,
  unwrapUtilityType,
} from './src/utils/flowUtilityTypes';

const {
  types: { namedTypes: types },
} = recast;
function setPropDescriptor(documentation, path: NodePath): void {
  if (types.ObjectTypeSpreadProperty.check(path.node)) {
    let argument = path.get('argument');
    while (isSupportedUtilityType(argument)) {
      argument = unwrapUtilityType(argument);
    }

    if (types.ObjectTypeAnnotation.check(argument.node)) {
      applyToFlowTypeProperties(argument, propertyPath => {
        setPropDescriptor(documentation, propertyPath);
      });
      return;
    }

    const name = argument.get('id').get('name');
    const resolvedPath = resolveToValue(name);

    if (resolvedPath && types.TypeAlias.check(resolvedPath.node)) {
      const right = resolvedPath.get('right');
      applyToFlowTypeProperties(right, propertyPath => {
        setPropDescriptor(documentation, propertyPath);
      });
    } else {
      documentation.addComposes(name.node.name);
    }
  } else if (types.ObjectTypeProperty.check(path.node)) {
    const type = getFlowType(path.get('value'));
    const propDescriptor = documentation.getPropDescriptor(
      getPropertyName(path),
    );
    propDescriptor.required = !path.node.optional;
    propDescriptor.flowType = type;

    // We are doing this here instead of in a different handler
    // to not need to duplicate the logic for checking for
    // imported types that are spread in to props.
    setPropDescription(documentation, path);
  }
}

/**
 * This handler tries to find flow Type annotated react components and extract
 * its types to the documentation. It also extracts docblock comments which are
 * inlined in the type definition.
 */
export default function flowTypeHandler(
  documentation: Documentation,
  path: NodePath,
) {
  const flowTypesPath = getFlowTypeFromReactComponent(path);

  if (!flowTypesPath) {
    return;
  }

  applyToFlowTypeProperties(flowTypesPath, propertyPath => {
    setPropDescriptor(documentation, propertyPath);
  });
}
