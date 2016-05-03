define([
    'angular',
    'config',
    'underscore',
    'settings',
    'services/all'
  ],
  function (angular, config, _) {
    "use strict";

    var module = angular.module('kibana.controllers');


    module.controller('LogoutCtrl', ['$scope', '$http', '$q', '$location', '$log', '$timeout', 'Settings',
      function ($scope, $http, $q, $location, $log, $timeout, Settings) {
        var logoutCalls = [];
        var solrLogoutPromise = $http.get(cfg.SERVICES.solrAdmin,
          {cache: false}
        );
        logoutCalls.push(solrLogoutPromise);
        var appLogoutPromise = $http.post('../logout', {cache: false});
        logoutCalls.push(appLogoutPromise);
        $q.all(logoutCalls).then(function () {
            // success
            return $timeout(function () {
              window.location = cfg.SERVICES.root;
            }, 100);
          },
          function () {
            // error
            $log.warn("Error exiting from Solr or the app");

          }
        );
      }]);
  });
