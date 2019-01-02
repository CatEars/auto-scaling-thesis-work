/**
 * Loads all the plugins in the plugin folder
 */
const fs = require('fs');
const path = require('path');
const pluginPath = process.env.PLUGIN_PATH || path.resolve(__dirname, 'log-plugins');

module.exports = () => {
  const plugins = fs.readdirSync(pluginPath).filter(plugin => plugin.endsWith('.js'));
  const pluginMap = {};
  plugins.map(plugin => {
    const pluginName = path.basename(plugin, '.js');
    const loadedModule = require(path.resolve(pluginPath, pluginName));
    pluginMap[pluginName] = loadedModule;
  })
  return pluginMap;
}
