/**
 * htm bound to React.createElement so the TUI can use JSX-like tagged-template
 * syntax with zero build step. Ink renders standard React elements.
 */
import htm from 'htm';
import React from 'react';

export const html = htm.bind(React.createElement);
export { React };
