import React from 'react';
import PropTypes from 'prop-types';

/* importing variable iconNames from .js file (js, jsx are supported, json is not) */
import iconNames from './icon-names';

class Icon extends React.Component {
  render() {
    /*implementation logic*/
    return null;
  }
}

Icon.propTypes = {
  /** Icon name */
  name: PropTypes.oneOf(iconNames).isRequired,
};

export default Icon;
