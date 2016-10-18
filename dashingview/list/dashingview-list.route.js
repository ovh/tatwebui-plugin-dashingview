/*global angular*/
angular.module('TatUi').config(function($stateProvider, PluginProvider) {
  'use strict';

  PluginProvider.addPlugin({
    'name': 'Dashing View',
    'route': 'dashingview-list',
    'type': 'messages-views',
    'default': false
  });

  $stateProvider.state('dashingview-list', {
    url: '/dashingview/list/{topic:topicRoute}?idMessage&filterInLabel&filterAndLabel&filterNotLabel&filterInTag&filterAndTag&filterNotTag',
    templateUrl: '../build/tatwebui-plugin-dashingview/dashingview/list/dashingview-list.view.html',
    controller: 'MessagesDashingViewListCtrl',
    controllerAs: 'ctrl',
    reloadOnSearch: false,
    translations: [
      'plugins/tatwebui-plugin-dashingview/dashingview'
    ]
  });
});
