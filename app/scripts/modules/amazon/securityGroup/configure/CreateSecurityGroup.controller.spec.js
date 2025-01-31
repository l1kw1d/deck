'use strict';

describe('Controller: CreateSecurityGroup', function () {

  beforeEach(
    window.module(
      require('../../../core/utils/lodash.js'),
      require('./CreateSecurityGroupCtrl.js'),
      require('./configSecurityGroup.mixin.controller.js')
    )
  );

  describe('filtering', function() {

    // Initialize the controller and a mock scope
    beforeEach(window.inject(function ($controller, $rootScope, $q, accountService, securityGroupReader, v2modalWizardService,
                                taskMonitorService, securityGroupWriter, vpcReader) {

      this.$scope = $rootScope.$new();
      this.$q = $q;
      this.accountService = accountService;
      this.securityGroupReader = securityGroupReader;
      this.v2modalWizardService = v2modalWizardService;
      this.taskMonitorService = taskMonitorService;
      this.securityGroupWriter = securityGroupWriter;
      this.vpcReader = vpcReader;

      spyOn(this.accountService, 'listAccounts').and.returnValue(
        $q.when(['prod', 'test'])
      );

      spyOn(this.accountService, 'getRegionsForAccount').and.returnValue(
        $q.when(['us-east-1', 'us-west-1'])
      );

      spyOn(this.vpcReader, 'listVpcs').and.returnValue(
        $q.when([
          { id: 'vpc1-pe', name: 'vpc 1', account: 'prod', region: 'us-east-1', deprecated: false, label: 'vpc 1' },
          { id: 'vpc2-pw', name: 'vpc 2', account: 'prod', region: 'us-west-1', deprecated: false, label: 'vpc 2' },
          { id: 'vpc1-te', name: 'vpc 1', account: 'test', region: 'us-east-1', deprecated: false, label: 'vpc 1' },
          { id: 'vpc2-te', name: 'vpc 2', account: 'test', region: 'us-east-1', deprecated: false, label: 'vpc 2' },
          { id: 'vpc2-tw', name: 'vpc 2', account: 'test', region: 'us-west-1', deprecated: false, label: 'vpc 2' },
        ])
      );

      spyOn(this.securityGroupReader, 'getAllSecurityGroups').and.returnValue(
        $q.when(
          {
            prod: {
              aws: {
                'us-east-1': [
                  { name: 'group1', vpcId: null, id: '1'},
                  { name: 'group2', vpcId: null, id: '2'},
                  { name: 'group3', vpcId: 'vpc1-pe', id: '3'},
                ],
                'us-west-1': [
                  { name: 'group1', vpcId: null, id: '1'},
                  { name: 'group3', vpcId: 'vpc2-pw', id: '3'},
                ]
              }
            },
            test: {
              aws: {
                'us-east-1': [
                  { name: 'group1', vpcId: null, id: '1'},
                  { name: 'group2', vpcId: 'vpc1-te', id: '2'},
                  { name: 'group3', vpcId: 'vpc1-te', id: '3'},
                  { name: 'group4', vpcId: 'vpc2-te', id: '4'},
                ],
                'us-west-1': [
                  { name: 'group1', vpcId: null, id: '1'},
                  { name: 'group3', vpcId: 'vpc1-tw', id: '3'},
                  { name: 'group3', vpcId: 'vpc2-tw', id: '3'},
                  { name: 'group5', vpcId: 'vpc2-tw', id: '5'},
                ]
              }
            }
          }
        )
      );

      this.initializeCtrl = function() {
        this.ctrl = $controller('awsCreateSecurityGroupCtrl', {
          $scope: this.$scope,
          $modalInstance: { result: this.$q.when(null) },
          accountService: this.accountService,
          securityGroupReader: this.securityGroupReader,
          v2modalWizardService: this.v2modalWizardService,
          taskMonitorService: this.taskMonitorService,
          securityGroupWriter: this.securityGroupWriter,
          vpcReader: this.vpcReader,
          application: this.application || { attributes: {}},
          securityGroup: { regions: [], securityGroupIngress: [] },
          settings: this.settings || {},
        });
        this.$scope.$digest();
      };

    }));

    it('initializes with no security groups available for ingress permissions', function () {
      this.initializeCtrl();
      expect(this.$scope.availableSecurityGroups.length).toBe(0);
    });

    it('sets up available security groups once an account and region are selected', function () {
      this.initializeCtrl();
      this.$scope.securityGroup.credentials = 'prod';
      this.ctrl.accountUpdated();
      this.$scope.$digest();
      expect(this.$scope.availableSecurityGroups.length).toBe(0);

      this.$scope.securityGroup.regions = ['us-east-1'];
      this.ctrl.accountUpdated();
      this.$scope.$digest();
      expect(this.$scope.availableSecurityGroups.length).toBe(2);
      expect(this.$scope.existingSecurityGroupNames).toEqual(['group1', 'group2']);
    });

    it('filters existing names based on join of groups from all regions', function() {
      this.initializeCtrl();
      this.$scope.securityGroup.credentials = 'test';
      this.$scope.securityGroup.regions = ['us-east-1', 'us-west-1'];
      this.$scope.securityGroup.vpcId = 'vpc2-te';
      this.ctrl.accountUpdated();
      this.$scope.$digest();
      expect(this.$scope.availableSecurityGroups.length).toBe(0);
      expect(this.$scope.existingSecurityGroupNames.sort()).toEqual(['group3', 'group4', 'group5']);
    });

    it('filters available names based on intersection of groups from all regions', function() {
      this.initializeCtrl();
      this.$scope.securityGroup.credentials = 'test';
      this.$scope.securityGroup.regions = ['us-east-1', 'us-west-1'];
      this.$scope.securityGroup.vpcId = 'vpc1-tw';
      this.ctrl.accountUpdated();
      this.$scope.$digest();
      expect(this.$scope.availableSecurityGroups.length).toBe(1);
    });

    it('filters VPCs based on account + region', function() {
      this.initializeCtrl();
      this.$scope.securityGroup.credentials = 'test';
      this.$scope.securityGroup.regions = ['us-east-1', 'us-west-1'];
      this.ctrl.accountUpdated();
      this.$scope.$digest();
      expect(_.pluck(this.$scope.vpcs, 'label').sort()).toEqual(['vpc 2']);

      this.$scope.securityGroup.regions = ['us-east-1'];
      this.ctrl.accountUpdated();
      this.$scope.$digest();
      expect(_.pluck(this.$scope.vpcs, 'label').sort()).toEqual(['vpc 1', 'vpc 2']);
    });

    describe('security group removal', function () {
      beforeEach(function () {
        spyOn(this.v2modalWizardService, 'markDirty').and.callFake(angular.noop);
        this.initializeCtrl();
        let securityGroup = this.$scope.securityGroup;
        securityGroup.credentials = 'prod';
        securityGroup.regions = ['us-east-1'];
        this.ctrl.accountUpdated();
        this.$scope.$digest();
      });

      it('removes rules that are not available when account changes', function () {
        let securityGroup = this.$scope.securityGroup;
        this.$scope.availableSecurityGroups.forEach(group => securityGroup.securityGroupIngress.push({name: group}));
        expect(securityGroup.securityGroupIngress.length).toBe(2);

        securityGroup.credentials = 'test';
        this.ctrl.accountUpdated();
        this.$scope.$digest();
        expect(this.$scope.state.removedRules.length).toBe(1);
        expect(this.v2modalWizardService.markDirty).toHaveBeenCalledWith('Ingress');
      });

      it('does not repeatedly add removed rule warnings when multiple rules for the same group are removed', function () {
        let securityGroup = this.$scope.securityGroup;
        this.$scope.availableSecurityGroups.forEach(group => {
          securityGroup.securityGroupIngress.push({name: group, startPort: 7001, endPort: 7001, protocol: 'HTTPS'});
          securityGroup.securityGroupIngress.push({name: group, startPort: 7000, endPort: 7000, protocol: 'HTTP'});

        });
        expect(securityGroup.securityGroupIngress.length).toBe(4);

        securityGroup.credentials = 'test';
        this.ctrl.accountUpdated();
        this.$scope.$digest();
        expect(this.$scope.state.removedRules).toEqual(['group2']);
        expect(this.v2modalWizardService.markDirty).toHaveBeenCalledWith('Ingress');
      });

    });

    describe('classic locking', function () {
      function init(self) {
        self.initializeCtrl();
        self.ctrl.regionUpdated();
        self.$scope.$digest();
      }

      it('does not hide classic when aws provider not configured', function () {
        init(this);
        expect(this.$scope.hideClassic).toBe(false);
      });

      it('does not hide classic when classicLaunchLockout not configured', function () {
        this.settings = { providers: { aws: {} } };
        init(this);
        expect(this.$scope.hideClassic).toBe(false);
      });

      it('does not hide classic when application has no attributes', function () {
        this.settings = { providers: { aws: { classicLaunchLockout: 10 } } };
        init(this);
        expect(this.$scope.hideClassic).toBe(false);

        this.application = {};
        init(this);
        expect(this.$scope.hideClassic).toBe(false);
      });

      it('does not hide classic when application is older than lockout date', function () {
        this.application = { attributes: { createTs: 9}};
        init(this);
        expect(this.$scope.hideClassic).toBe(false);
      });

      it('hides classic when application createTs is numeric and the same as lockout', function () {
        this.settings = { providers: { aws: { classicLaunchLockout: 10 } } };
        this.application = { attributes: { createTs: 10}};
        init(this);
        expect(this.$scope.hideClassic).toBe(true);
      });

      it('hides classic when application createTs is numeric and after lockout', function () {
        this.settings = { providers: { aws: { classicLaunchLockout: 10 } } };
        this.application = { attributes: { createTs: 11}};
        init(this);
        expect(this.$scope.hideClassic).toBe(true);
      });

      it('hides classic when application createTs is a string and the same as lockout', function () {
        this.settings = { providers: { aws: { classicLaunchLockout: 10 } } };
        this.application = { attributes: { createTs: '10'}};
        init(this);
        expect(this.$scope.hideClassic).toBe(true);
      });

      it('hides classic when application createTs is a string and after lockout', function () {
        this.settings = { providers: { aws: { classicLaunchLockout: 10 } } };
        this.application = { attributes: { createTs: '11'}};
        init(this);
        expect(this.$scope.hideClassic).toBe(true);
      });

      it('sets vpcId to first active if classic is locked', function () {
        this.settings = { providers: { aws: { classicLaunchLockout: 10 } } };
        this.application = { attributes: { createTs: 10}};
        this.initializeCtrl();

        this.$scope.securityGroup.credentials = 'prod';
        this.$scope.securityGroup.regions = ['us-east-1'];
        this.ctrl.regionUpdated();
        this.$scope.$digest();

        expect(this.$scope.securityGroup.vpcId).toBe('vpc1-pe');
      });

      it('leaves vpcId alone if already selected and classic locked', function () {
        this.settings = { providers: { aws: { classicLaunchLockout: 10 } } };

        this.application = { attributes: { createTs: 10}};
        this.initializeCtrl();
        this.$scope.securityGroup.vpcId = 'vpc2-te';
        this.$scope.securityGroup.credentials = 'test';
        this.$scope.securityGroup.regions = ['us-east-1'];
        this.ctrl.regionUpdated();
        this.$scope.$digest();
        expect(this.$scope.securityGroup.vpcId).toBe('vpc2-te');
      });
    });

  });
});
