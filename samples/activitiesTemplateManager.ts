
type activityTemplate = service.activities.IActivitiesTemplate<service.activities.IActivityTemplateBase>;

class ActivitiesTemplateManager extends TemplateManager<Activities.IModelBase | any> {

  /* @ngInject */
  public constructor(
    protected $q: ng.IQService,
    private activitiesMiddlewareService: ActivitiesMiddlewareService,
    public objectObserver: ObjectObserver,
    store: StorageManagerService,
    private proteusActivityNew: ActivitiesNew,
    $rootScope: ng.IRootScopeService,
    $state: ng.ui.IStateService,
    private activitiesTemplateContentChangeService: ActivitiesTemplateContentChangeService,
    public currentUser: CurrentUser,
    protected $log: ng.ILogService,
    private activitiesTemplateViewStateService: ActivitiesTemplateViewStateService,
    activitiesTemplateService: Templates.ITemplateService,
    activitiesTemplateStateHandler: Templates.IStateHandler) {
    super($q, activitiesMiddlewareService, objectObserver, store, $rootScope, currentUser, $log, activitiesTemplateService, activitiesTemplateStateHandler, $state);
    this.changedCallback = (changes: IObserverChanges) => {
      this.activitiesTemplateContentChangeService.onChangedCallback(this.getCurrentTemplate(), changes);
    };
  }

  /**
   *  Functions to execute when the user logs out.
   */
  public onLogout(): void {
    this.clean();
  }

  public createActivity(done: Function): void {
    this.proteusActivityNew.getNewActivity().then((newActivity: activityTemplate) => {
      this.saveDraftTemplate(newActivity, (error: any, savedActivity: activityTemplate) => {
        this.registerNewTemplate(savedActivity);
        done(savedActivity);
      });
    });
  }

  public onLogin(): void {
    this.initFromStore();
  }

  public clean(): void {
    super.clean();
    let activeItems = this.getActiveItems();
    activeItems.forEach((item: service.activities.IActivitiesTemplate<service.activities.IActivityTemplateBase>) => {
      if (item) {
        this.activitiesTemplateViewStateService.delete(item.id);
      }
    });
  }

  public closeTemplate(templateId: string): void {
    super.closeTemplate(templateId);
    this.activitiesTemplateViewStateService.delete(templateId);
  }


  public save(): void {
    const that = this as any;
    const toSave = { length: 0 };
    that.actives.forEach(function (val: string) {
      Array.prototype.push.call(toSave, { id: val, type: 'actives' });
    });
    that.recents.forEach(function (val: string) {
      Array.prototype.push.call(toSave, { id: val, type: 'recents' });
    });
    (<any>toSave).selectedTemplate = that.currentTemplateId;
    set(this.storageKey, toSave);
  }

  protected updateStorage(): void { }


  private get storageKey(): string {
    return this.currentUser.userId + '|' + this.activitiesMiddlewareService.getType();
  }


  private initFromStore(): void {
    let val = get(this.storageKey);

    let index = val && val.length;
    const selected = val && val.selectedTemplate;
    if (index) {
      let toFind = [];
      const temp = { actives: [], recents: [] };
      while (index--) {
        toFind.push(val[index].id);
        temp[val[index].type][selected === val[index].id ? 'unshift' : 'push'](val[index].id);
      }
      this.templates = [];
      this.openTemplates(toFind, (<any>val).selectedTemplate).finally(() => {
        this.actives = temp.actives;
        this.recents = temp.recents;
        this.setUpWatcher();
      });
    } else {
      this.actives = [];
      this.recents = [];
      this.setUpWatcher();
    }
  }

  private setUpWatcher(): void {
    let diff = 0;
    let activesCount = this.actives.length;
    let recentCount = this.recents.length;
    let opened = this.currentTemplateId;
    this.currentUser.addOnLogoutListener(this.$rootScope.$watch(
      () => {
        if (activesCount !== this.actives.length) {
          activesCount = this.actives.length;
          diff++;
        }
        if (recentCount !== this.recents.length) {
          recentCount = this.recents.length;
          diff++;
        }
        if (opened !== this.currentTemplateId) {
          diff++;
          opened = this.currentTemplateId;
        }
        return diff;
      },
      (newVal: any, oldVal: any) => {
        if (newVal === oldVal) {
          return;
        }
        this.save();
      }));
  }
}

// this eventually will be moved to mongod
// once this ticket is resolved
// http://jira.axiomainc.com:8081/browse/PUI-6995
function get(key: string) {
  return JSON.parse(window.localStorage.getItem(key));
}

function set(key: string, val: any) {
  window.localStorage.setItem(key, JSON.stringify(val));
}


export default ActivitiesTemplateManager;
