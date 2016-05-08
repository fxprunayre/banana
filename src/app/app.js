/*
 * Copyright 2014-2016 European Environment Agency
 *
 * Licensed under the EUPL, Version 1.1 or – as soon
 * they will be approved by the European Commission -
 * subsequent versions of the EUPL (the "Licence");
 * You may not use this work except in compliance
 * with the Licence.
 * You may obtain a copy of the Licence at:
 *
 * https://joinup.ec.europa.eu/community/eupl/og_page/eupl
 *
 * Unless required by applicable law or agreed to in
 * writing, software distributed under the Licence is
 * distributed on an "AS IS" basis,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied.
 * See the Licence for the specific language governing
 * permissions and limitations under the Licence.
 */

/**
 * main app level module
 */
define([
  'angular',
  'jquery',
  'underscore',
  'require',
  'elasticjs',
  'solrjs',
  'bootstrap',
  'angular-route',
  'angular-sanitize',
  'angular-animate',
  'angular-strap',
  'angular-strap-tpl',
  'angular-dragdrop',
  'angular-translate',
  'angular-translate-loader-static-files',
  'angular-gettext',
  'extend-jquery'
],
function (angular, $, _, appLevelRequire) {
  "use strict";

  var app = angular.module('kibana', []),
    // we will keep a reference to each module defined before boot, so that we can
    // go back and allow it to define new features later. Once we boot, this will be false
    pre_boot_modules = [],
    // these are the functions that we need to call to register different
    // features if we define them after boot time
    register_fns = {};

  /**
   * Tells the application to watch the module, once bootstraping has completed
   * the modules controller, service, etc. functions will be overwritten to register directly
   * with this application.
   * @param  {[type]} module [description]
   * @return {[type]}        [description]
   */
  app.useModule = function (module) {
    if (pre_boot_modules) {
      pre_boot_modules.push(module);
    } else {
      _.extend(module, register_fns);
    }
    return module;
  };

  app.safeApply = function ($scope, fn) {
    switch($scope.$$phase) {
    case '$apply':
      // $digest hasn't started, we should be good
      $scope.$eval(fn);
      break;
    case '$digest':
      // waiting to $apply the changes
      setTimeout(function () { app.safeApply($scope, fn); }, 10);
      break;
    default:
      // clear to begin an $apply $$phase
      $scope.$apply(fn);
      break;
    }
  };
  app.factory('httpInterceptor', function($q) {
    return {
      'request': function(c) {
        var t = c.url.match('/.*/(.*)/select');
        if (t && t.length > 0) {
          c.url = c.url.replace(
            '\/solr\/' + t[1] + '\/select',
            '/api/search/' + t[1]);
          // The proxy does not support POST
          if (c.method === 'POST') {
            c.method = 'GET';
            c.url = c.url +
                    (c.url.indexOf('?') === -1 ? '?' : '&') +
                    c.data;
          }
        }
        return c;
      }
    };
  });


  /**
   * Translation loader which first loads static files
   * for translating the application and then (optionnaly)
   * load the current dashboard translation file.
   */
  app.factory('bananaTranslationLoader', function ($http, $q) {
    return function (options) {

      if (!options || (!angular.isArray(options.files) && (!angular.isString(options.prefix) || !angular.isString(options.suffix)))) {
        throw new Error('Couldn\'t load static files, no files and prefix or suffix specified!');
      }

      if (!options.files) {
        options.files = [{
          prefix: options.prefix,
          suffix: options.suffix
        }];
      }

      var load = function (file) {
        if (!file || (!angular.isString(file.prefix) || !angular.isString(file.suffix))) {
          throw new Error('Couldn\'t load static file, no prefix or suffix specified!');
        }

        return $http(angular.extend({
              url: [
                file.prefix,
                options.key,
                file.suffix
              ].join(''),
              method: 'GET',
              cache: true,
              params: ''
            }, options.$http))
          .then(function(result) {
            return result.data;
          }, function () {
            return $q.reject(options.key);
          });
      };

      var promises = [],
        length = options.files.length;

      for (var i = 0; i < length; i++) {
        promises.push(load({
           prefix: options.files[i].prefix,
           key: options.key,
           suffix: options.files[i].suffix
         }));
      }


      if (options.id) {
        promises.push($http({
           url: options.config.solr + options.config.banana_index +
                '/select?wt=json&q=+type:translation +id:"' + options.id + '"',
           method: "GET"
         }).then(function (response) {
          var docs = response.data.response.docs;
          for (var i = 0; i < docs.length; i++) {
            for (var p in docs[i]) {
              if (docs[i].hasOwnProperty(p) && p === ('lang_' + options.key)) {
                return angular.fromJson(docs[i][p]);
              }
            }
          }
          return {};
          }, function () {
            return $q.reject(options.key);
          })
        );
      }

      return $q.all(promises)
        .then(function (data) {
          var length = data.length,
            mergedData = {};

          for (var i = 0; i < length; i++) {
            for (var key in data[i]) {
              mergedData[key] = data[i][key];
            }
          }

          return mergedData;
        });
    };
  });
  app.constant("translationConfig", {files: [{
    prefix: 'app/i18n/',
    suffix: '.json'
  },{
    prefix: '../assets/i18n/',
    suffix: '.json'
  }]});
  app.config(function (
      $routeProvider, $controllerProvider, $compileProvider, $httpProvider,
      $filterProvider, $provide, $translateProvider, translationConfig) {
    $httpProvider.interceptors.push('httpInterceptor');

    $routeProvider
      .when('/dashboard', {
        templateUrl: 'app/partials/dashboard.html'
      })
      .when('/dashboard/:kbnType/:kbnId', {
        templateUrl: 'app/partials/dashboard.html'
      })
      .when('/dashboard/:kbnType/:kbnId/:params', {
        templateUrl: 'app/partials/dashboard.html'
      })
      // Login/logout are managed by location change
      .otherwise({
        redirectTo: 'dashboard'
      });
    // this is how the internet told me to dynamically add modules :/
    register_fns.controller = $controllerProvider.register;
    register_fns.directive  = $compileProvider.directive;
    register_fns.factory    = $provide.factory;
    register_fns.service    = $provide.service;
    register_fns.filter     = $filterProvider.register;

    // Set translation provider to load JSON file
    $translateProvider
      .useLoader('bananaTranslationLoader', translationConfig)
      .registerAvailableLanguageKeys(['en', 'fr'], {
        'fr': 'fr',
        '*': 'en'
      })
      .determinePreferredLanguage();
  });

  // $http requests in Angular 1.0.x include the 'X-Requested-With' header
  // which triggers the preflight request in CORS. This does not work as
  // Solr rejects the preflight request, so I have to remove the header.
  // NOTE: The 'X-Requested-With' header has been removed in Angular 1.1.x
  app.config(['$httpProvider', function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
    delete $httpProvider.defaults.headers.common["X-Requested-With"];
  }]);

  // Handle login and logout by checking route change events.
  app.run(function($rootScope, $location, $http, $log) {
    $rootScope.$on('$routeChangeStart', function() {
      if ($location.path() === '/login') {
        window.location = '../api/signin-form';
      } else if ($location.path() === '/signout') {
        $http.post('../signout', {cache: false}).then(
          function () {
            window.location = '../';
          },
          function () {
            $log.warn("Error exiting from Solr or the app");
          });
      }
    });
  });

  // TODO: add ajax-solr ?
  var apps_deps = [
    'elasticjs.service',
    'solrjs.service',
    'ngAnimate',
    'mgcrea.ngStrap',
    'mgcrea.ngStrap.helpers.parseOptions',
    'mgcrea.ngStrap.tooltip',
    'ngRoute',
    'ngSanitize',
    'ngDragDrop',
    'ngeo',
    'gettext',
    'pascalprecht.translate',
    'kibana'
  ];

  _.each('controllers directives factories services filters'.split(' '),
  function (type) {
    var module_name = 'kibana.'+type;
    // create the module
    app.useModule(angular.module(module_name, []));
    // push it into the apps dependencies
    apps_deps.push(module_name);
  });

  app.panel_helpers = {
    partial: function (name) {
      return 'app/partials/'+name+'.html';
    }
  };

  // load the core components
  require([
    'controllers/all',
    'directives/all',
    'filters/all'
  ], function () {

    // bootstrap the app
    angular
      .element(document)
      .ready(function() {
        $('body').attr('ng-controller', 'DashCtrl');
        angular.bootstrap(document, apps_deps)
          .invoke(['$rootScope', '$location', 'userService',
            function ($rootScope, $location, userService) {
            _.each(pre_boot_modules, function (module) {
              _.extend(module, register_fns);
            });
            pre_boot_modules = false;

            $rootScope.noHeader = $location.search().noHeader !== undefined;
            $rootScope.readonly = $location.search().readonly !== undefined ||
                                  userService.getUser() === null;

            // Update readonly status based on authentication status
            userService.getCurrentUserInfo().then(function(data) {
              $rootScope.readonly = $location.search().readonly !== undefined ||
                                    data.authenticated === false;
            });

            $rootScope.requireContext = appLevelRequire;
            $rootScope.require = function (deps, fn) {
              var $scope = this;
              $scope.requireContext(deps, function () {
                var deps = _.toArray(arguments);
                $scope.$apply(function () {
                  fn.apply($scope, deps);
                });
              });
            };
          }]);
      });
  });

  return app;
});
