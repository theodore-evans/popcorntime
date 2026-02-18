(function(App) {
  'use strict';
  App.start();

  /* load all the things ! */
  var fs = require('fs');

  function loadLocalProviders() {
    var providerPath = './src/app/lib/providers/';

    var files = fs.readdirSync(providerPath);

    var head = document.getElementsByTagName('head')[0];
    return files
      .map(function(file) {
        if (!file.match(/\.js$/) || file.match(/generic.js$/)) {
          return null;
        }

        return new Promise((resolve, reject) => {
          var script = document.createElement('script');

          script.type = 'text/javascript';
          script.src = 'lib/providers/' + file;

          var timeout = setTimeout(function() {
            win.error('Provider script timed out:', file);
            resolve(null);
          }, 10000);

          script.onload = function() {
            clearTimeout(timeout);
            script.onload = null;
            script.onerror = null;
            win.info('Loaded local provider:', file);
            resolve(file);
          };

          script.onerror = function() {
            clearTimeout(timeout);
            script.onload = null;
            script.onerror = null;
            win.error('Failed to load provider:', file);
            resolve(null);
          };

          head.appendChild(script);
        });
      })
      .filter(function(q) {
        return q;
      });
  }

  function loadFromNPM(name, fn) {
    const P = require(name);
    return Promise.resolve(fn(P));
  }

  function loadProvidersJSON(fn) {
    return pkJson.providers.map(function(providerPath) {
      win.info('Loaded provider:', providerPath);
      return loadFromNPM(`./${providerPath}`, fn);
    });
  }

  // Allowlists for dynamic package loading — prevents arbitrary package execution
  var ALLOWED_PROVIDERS = ['butter-provider'];
  var ALLOWED_SETTINGS = ['butter-settings-popcorntime.app'];

  function loadFromPackageJSON(regex, fn) {
    var allowlist = regex.toString().indexOf('butter-provider') !== -1 ? ALLOWED_PROVIDERS : ALLOWED_SETTINGS;
    var packages = Object.keys(pkJson.dependencies).filter(function(p) {
      return p.match(regex) && allowlist.some(function(allowed) { return p === allowed || p.indexOf(allowed) === 0; });
    });

    return packages.map(function(name) {
      win.info('Loaded npm', regex, name);
      return loadFromNPM(name, fn);
    });
  }

  function loadNpmProviders() {
    return loadProvidersJSON(App.Providers.install);
  }

  function loadLegacyNpmProviders() {
    return loadFromPackageJSON(/butter-provider-/, App.Providers.install);
  }

  // Only allow known settings keys from external packages
  var ALLOWED_SETTINGS_KEYS = [
    'projectName', 'projectUrl', 'projectBlog', 'projectForum', 'statusUrl',
    'changelogUrl', 'issuesUrl', 'sourceUrl', 'commitUrl',
    'dht', 'providers', 'opensubtitles', 'fanart', 'tvdb', 'tmdb',
    'updateKey', 'homepageRecent', 'homepageFavorite', 'homepageWatchedList'
  ];

  function loadNpmSettings() {
    return Promise.all(
      loadFromPackageJSON(/butter-settings-/, function(settings) {
        var filtered = {};
        ALLOWED_SETTINGS_KEYS.forEach(function(key) {
          if (settings.hasOwnProperty(key)) { filtered[key] = settings[key]; }
        });
        Settings = _.extend(Settings, filtered);
      })
    );
  }

  function loadProviders() {
    return Promise.all(
      loadLocalProviders()
    );
  }

  function loadProvidersDelayed() {
    return Promise.all(
      loadNpmProviders().concat(loadLegacyNpmProviders())
    );
  }

  App.bootstrapPromise = loadNpmSettings()
    .then(loadProviders)
    .then(loadProvidersDelayed)
    .then(function(values) {
      return _.filter(
        _.keys(Settings.providers).map(function(type) {
          return {
            provider: App.Config.getProviderForType(type),
            type: type
          };
        }),
        function(p) {
          return p.provider;
        }
      );
    })
    .then(function(providers) {
      App.TabTypes = {};

      _.each(providers, function(provider) {
        var p = Settings.providers[provider.type];
        if (!p.name) {
          return;
        }

        App.TabTypes[provider.type] = p.name;
      });

      return providers;
    });
})(window.App);
