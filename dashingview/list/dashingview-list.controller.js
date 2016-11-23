/*global angular,_,moment */

/**
 * @ngdoc controller
 * @name TatUi.controller:MessagesDashingViewListCtrl
 * @requires TatUi.TatEngineMessagesRsc Tat Engine Resource Messages
 * @requires TatUi.TatEngine            Global Tat Engine service
 *
 * @description List Messages controller
 */
angular.module('TatUi')
  .controller('MessagesDashingViewListCtrl', function(
    $scope,
    $rootScope,
    $stateParams,
    $interval,
    $cookieStore,
    Authentication,
    TatEngineMessagesRsc,
    TatEngine,
    TatFilter,
    TatTopic,
    progressBarManager,
    $window
  ) {
    'use strict';

    var self = this;
    self.filter = TatFilter.getCurrent();
    self.topic = $stateParams.topic;

    self.data = {
      messages: [],
      requestFrequency: 5000,
      count: 150,
      skip: 0,
      displayMore: true,
      treeView: "notree",
      initialLoading: false
    };

    $scope.$on('filter-changed', function(ev, filter){
      self.data.skip = 0;
      self.data.displayMore = true;
      self.filter = angular.extend(self.filter, filter);
      self.refresh();
    });

    self.getCurrentDate = function() {
      return moment().format('YYYY/MM/DD-HH:MM');
    };

    self.currentDate = self.getCurrentDate();

    self.getBrightness = function(rgb) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(rgb);
      return result ?
        0.2126 * parseInt(result[1], 16) +
        0.7152 * parseInt(result[2], 16) +
        0.0722 * parseInt(result[3], 16) : 0;
    };

    /**
     * @ngdoc function
     * @name mergeMessages
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description Merge messages in the current message list
     * @param {string} messages Message list to merge
     */
    self.mergeMessages = function(dest, source) {
      if (source && _.isArray(source)) {
        for (var i = 0; i < source.length; i++) {
          var origin = _.find(dest, {
            _id: source[i]._id
          });
          if (origin) {
            if (!origin.replies) {
              origin.replies = [];
            }
            self.mergeMessages(origin.replies, source[i].replies);
            origin.labels = source[i].labels;
            origin.likers = source[i].likers;
            origin.nbLikes = source[i].nbLikes;
            origin.nbReplies = source[i].nbReplies;
            origin.dateUpdate = source[i].dateUpdate;
            origin.text = source[i].text;
            origin.tags = source[i].tags;
          } else {
            if (!self.data.intervalTimeStamp) {
              self.data.intervalTimeStamp = source[i].dateUpdate;
            } else if (source[i].dateUpdate > self.data.intervalTimeStamp) {
              self.data.intervalTimeStamp = source[i].dateUpdate;
            }
            dest.push(source[i]);
            dest.sort(function(a, b) {
              if (a.dateCreation > b.dateCreation) {
                return -1;
              }
              if (a.dateCreation < b.dateCreation) {
                return 1;
              }
              return 0;
            });
          }
        }
      }
      return dest;
    };

    /**
     * @ngdoc function
     * @name beginTimer
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description Launch the timer to request messages at regular time interval
     */
    self.beginTimer = function() {
      self.data = angular.extend(self.data, TatTopic.getDataTopic());
      var timeInterval = self.data.requestFrequency;
      if ('undefined' === typeof self.data.timer) {
        self.getNewMessages(); // Don't wait to execute first call
        self.data.timer = $interval(self.getNewMessages, timeInterval);
        $scope.$on("$destroy", function() { self.stopTimer(); });
      }
    };

    /**
     * @ngdoc function
     * @name stopTimer
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description Stop the time that request messages at regular time interval
     */
    self.stopTimer = function() {
      $interval.cancel(self.data.timer);
      self.data.timer = undefined;
    };

    /**
     * @ngdoc function
     * @name buildFilter
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description Build a filter to read messages
     * @param {object} data Custom data to send to the API
     * @return {object} Parameters to pass to the API
     */
    self.buildFilter = function(data) {
      return angular.extend({}, data, self.filter);
    };

    /**
     * @ngdoc function
     * @name getNewMessages
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description Request for new messages
     */
    self.getNewMessages = function() {
      if (self.loading) {
        console.log("messages list already in refresh...");
        return;
      }
      self.loading = true;
      self.currentDate = self.getCurrentDate();
      var filterAttrs = {
        topic: self.topic,
        treeView: 'notree',
        onlyMsgRoot: true,
        limit: self.data.count,
        skip: self.data.skip
      };
      if (!TatFilter.containsDateFilter) {
        filterAttrs.dateMinUpdate = self.data.intervalTimeStamp;
      }
      var filter = self.buildFilter(filterAttrs);
      return TatEngineMessagesRsc.list(filter).$promise.then(function(data) {
        self.digestInformations(data);
      }, function(err) {
        TatEngine.displayReturn(err);
        self.loading = false;
      });
    };

    /**
     * @ngdoc function
     * @name digestInformations
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description
     * @return
     */
    self.digestInformations = function(data) {
      self.data.isTopicRw = data.isTopicRw;
      self.data.messages = self.mergeMessages(self.data.messages, data.messages);
      self.loading = false;
      self.data.initialLoading = false;
      self.computeStack();
    };

    self.computeStack = function() {
      var nbTotal = self.data.messages.length;
      if (nbTotal == 0) {
        return;
      }

      for (var i = 0; i < nbTotal; i++) {
        this.computeStatus(self.data.messages[i]);
      }
    };

    /**
     * @ngdoc function
     * @name init
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description Initialize list messages page. Get list of messages from Tat Engine
     */
    self.init = function() {
      self.data.initialLoading = true;
      if (!angular.isDefined($cookieStore.get("showSidebar")) || $cookieStore.get("showSidebar") == true) {
        $rootScope.$broadcast("sidebar-toggle");
      }
      TatTopic.computeTopic(self.topic, self.beginTimer);
    };

    /**
     * @ngdoc function
     * @name refresh
     * @methodOf TatUi.controller:MessagesDashingViewListCtrl
     * @description Refresh all the messages
     */
    self.refresh = function() {
      self.data.currentTimestamp = Math.ceil(new Date().getTime() / 1000);
      self.data.messages = [];
      self.moreMessage();
    };

    self.setMessage = function(message) {
      message.displayed = true;
      $scope.message = message;
    };

    self.isMonitoring = function(message) {
      if (message.tags && message.tags.length >= 3) {
          if ((message.tags[0] === 'monitoring') &&
            (message.tags[2].indexOf('item:') === 0)) {
          return true;
        }
      }
      return false;
    };

    self.isInt = function(value) {
      return !isNaN(value) && (function(x) { return (x | 0) === x; })(parseFloat(value));
    }
    self.isHex = function(value) {
      return /(^[0-9A-Fa-f]{6}$)|(^[0-9A-Fa-f]{3}$)/i.test(value);
    }

    self.computeStatus = function(message) {
      message.bar = progressBarManager();
      message.bar.clear();
      message.style = "";
      message.widget = "";
      message.orderBox = "";
      message.widgetMinValue = "";
      message.widgetMaxValue = "";
      message.widgetValue = "";
      message.widgetValueText = "";
      message.widgetOptions = {};
      message.valueMsg = "";
      message.url = "";
      message.textClean = message.text.replace("#monitoring", "").trim();
      message.widgetData = null;
      message.textClean = message.textClean.replace("#item:"+message.item+" ", "");
      if (message.tags && message.tags.length > 0) {
        var service = message.tags[1];
        message.textClean = message.textClean.replace("#"+service+" ", " ");
        message.service = service;
      }

      for (var i = 0; i < message.tags.length; i++) {
        var tag = message.tags[i];
        if (tag.indexOf("item:") == 0) {
          message.item = tag.substring(5);
          message.textClean = message.textClean.replace("#"+tag, "");
          break;
        }
      }

      if (message.labels) {
        for (var i = 0; i < message.labels.length; i++) {
          var label = message.labels[i];
          var labelText = message.labels[i].text;
          if (labelText.indexOf("bg-color") == 0) {
            message.style += "background-color:" + label.color + ";";
          } else if (labelText.indexOf("border-width") == 0) {
            message.style += "border-width:" + labelText.substring(13) + ";";
          } else if (labelText.indexOf("border-style") == 0) {
            message.style += "border-style:" + labelText.substring(13) + ";";
          } else if (labelText.indexOf("border-color") == 0) {
            message.style += "border-color:" + labelText.substring(13) + ";";
          } else if (labelText.indexOf("title-font-size") == 0) {
            message.styleTitle += "font-size:" + labelText.substring(16) + ";";
          } else if (labelText.indexOf("value-font-size") == 0) {
            message.styleValue += "font-size:" + labelText.substring(16) + ";";
          } else if (labelText.indexOf("color") == 0) {
            message.style += "color:" + label.color + ";";
          } else if (labelText.indexOf("height:") == 0) {
            message.style += "height:" + labelText.substring(7) + ";";
          } else if (labelText.indexOf("width:") == 0) {
            message.style += "width:" + labelText.substring(6) + ";";
          } else if (labelText.indexOf("hide-bottom") == 0) {
            message.styleBottom = "display:none";
          } else if (labelText.indexOf("url:") == 0) {
            message.url = labelText.substring(4);
            message.style += "cursor:pointer;";
          } else if (labelText.indexOf("value:") == 0) {
            message.valueMsg = labelText.substring(6);
            if (self.isInt(message.valueMsg)) {
              message.valueMsg = parseFloat(message.valueMsg);
            }
          } else if (labelText.indexOf("order:") == 0) {
            message.orderBox = labelText.substring(6);
            if (self.isInt(message.orderBox)) {
              message.orderBox = parseFloat(message.orderBox);
            }
          } else if (labelText.indexOf("widget:") == 0) {
            message.widget = labelText.substring(7);
          } else if (labelText.indexOf("widget-min:") == 0) {
            message.widgetMinValue = labelText.substring(11);
          } else if (labelText.indexOf("widget-max:") == 0) {
            message.widgetMaxValue = labelText.substring(11);
          } else if (labelText.indexOf("widget-mode:") == 0) {
            message.widgetMode = labelText.substring(12);
          } else if (labelText.indexOf("widget-class:") == 0) {
            message.widgetClass = labelText.substring(13);
          } else if (labelText.indexOf("percentRunning:") == 0) {
              message.widget = "progressbar";
              message.widgetValue = labelText.substring(15);
              message.widgetValueText = labelText.substring(15);
              if (self.isInt(message.widgetValue)) {
                message.widgetValue = parseFloat(message.widgetValue);
                message.widgetValueText = parseFloat(message.widgetValue);
                if (message.widgetValue === 100) {
                  message.bar.done();
                } else if (message.widgetValue === 0) {
                  message.widgetValue = 99;
                  message.widgetValueText = 0;
                  message.widgetClass = "progress-bar-danger";
                }
              }
          } else if (labelText.indexOf("widget-value:") == 0) {
            message.widgetValue = labelText.substring(13);
            if (self.isInt(message.widgetValue)) {
              message.widgetValue = parseFloat(message.widgetValue);
              if (message.widgetValue === 100) {
                message.bar.done();
              }
            }
          } else if (labelText.indexOf("widget-options:") == 0) {
            var sep = ",";
            if (labelText.substring(15).indexOf(",") < 0) sep = " ";
            var opts = labelText.substring(15).split(sep);
            for (var k = 0; k < opts.length; k++) {
              var idx = opts[k].indexOf(":");
              if (idx > 0) {
                var value = opts[k].substring(idx+1, opts[k].length).trim();
                var attr = opts[k].substring(0, idx);
                if (self.isInt(value)) {
                  if (attr === "axisY.offset") {
                    message.widgetOptions.axisY = { offset: parseInt(value) };
                  } else if (attr === "axisX.offset") {
                    message.widgetOptions.axisX = { offset: parseInt(value) };
                  } else {
                    message.widgetOptions[attr] = parseInt(value);
                  }
                } else if (value === 'true' || value === 'false') {
                  message.widgetOptions[attr] = (value === "true");
                } else {
                  message.widgetOptions[attr] = value;
                }
              }
            }
          } else if (labelText.indexOf("widget-data-labels:") == 0) {
            var sep = ",";
            if (labelText.substring(19).indexOf(",") < 0) sep = " ";
            var serie = labelText.substring(19).split(sep);
            self.initWidgetData(message);
            message.widgetData.labels = serie;
          } else if (labelText.indexOf("widget-data-legendNames:") == 0) {
            var sep = ",";
            if (labelText.substring(24).indexOf(",") < 0) sep = " ";
            var serie = labelText.substring(24).split(sep);
            message.widgetOptions.plugins = [
                Chartist.plugins.legend({
                    legendNames: serie,
                })
            ];
          } else if (labelText.indexOf("widget-data-serie:") == 0) {
            var sep = ",";
            if (labelText.substring(18).indexOf(",") < 0) sep = " ";
            var serie = labelText.substring(18).split(sep);
            self.initWidgetData(message);
            message.widgetData.series = serie;
          } else if (labelText.indexOf("widget-data-series:") == 0) {
            var sep = ",";
            if (labelText.substring(19).indexOf(",") < 0) sep = " ";
            var serie = labelText.substring(19).split(sep);
            var serieSanitize = [];
            for (var idxValue = 0; idxValue < serie.length; idxValue++) {
              var v = serie[idxValue].trim();
              if (self.isInt(v)) {
                serieSanitize.push(parseInt(v));
              } else {
                serieSanitize.push(v);
              }
            }
            self.initWidgetData(message);
            message.widgetData.series.push(serie);
          }
        }

        for (var i = 0; i < message.labels.length; i++) {
          var l = message.labels[i];
          if (l.text === 'AL' || l.text === 'open') {
            if (message.orderBox === "") {
              message.orderBox = 1;
            }
            if (message.style === "") {
              message.statusCss = 'btn-danger';
            }
            return;
          } else if (l.text === 'UP' || l.text === 'done') {
            if (message.orderBox === "") {
              message.orderBox = 3;
            }
            if (message.style === "") {
              message.statusCss = 'btn-success';
            }
            return;
          } else if (l.text === 'WARN') {
            if (message.orderBox === "") {
              message.orderBox = 2;
            }
            if (message.style === "") {
              message.statusCss = 'btn-warning';
            }
            return;
          }
        }

        if (message.style === "") {
          message.statusCss = 'btn-warning';
        }
        if (message.orderBox === "") {
          message.orderBox = 2;
        }
      }
    }

    self.initWidgetData = function(message) {
      if (!message.widgetData) {
        message.widgetData = { series : []};
      }
    }

    self.goToURL = function(url) {
      if (url === "") {
        return;
      }
      $window.open(url, '_blank');
    }

    self.containsLabel = function(message, labelText) {
      if (message.inReplyOfIDRoot) {
        return false;
      }
      var r = false;
      if (message.labels) {
        for (var i = 0; i < message.labels.length; i++) {
          var l = message.labels[i];
          if (l.text === labelText) {
            return true;
          }
        }
      }
      return r;
    };

    self.init();
  });
