export function currentActivesDirective() {
  return {
    restrict: 'A',
    scope: {},
    controller: currentActivesController,
    bindToController: {
      getActives: '&',
      getRecents: '&',
      openModal: '&',
      openTemplate: '&'
    },
    controllerAs: 'ctrl',
    template: require('./currentActives.template.html')
  };
}


currentActivesController.$inject = ['$scope'];
function currentActivesController(scope: ng.IScope) {
  const originalFn = this.openTemplate;
  this.openRecent = this.openActive = function (item: any) {
    originalFn({ $item: item });
  };
}
