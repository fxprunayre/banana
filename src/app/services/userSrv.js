define([
    'angular',
    'jquery'
  ],
  function (angular) {
    'use strict';

    var module = angular.module('kibana.services');

    module.factory('userService', ['$http', '$q',
      function($http, $q) {
        var currentUser = null;


        return {

          getCurrentUserInfo: function() {
            var deferred = $q.defer();
            $http.get('../daobs/userDetails').success(function (data) {
              currentUser = data;
              deferred.resolve(data);
            }).error(function(response) {
              currentUser = null;
              deferred.reject(response);
            });

            return deferred.promise;
          },
          getUser: function() {
            return angular.copy(currentUser);
          }
        };
      }
    ]);
  });
