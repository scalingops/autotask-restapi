/*
  Copyright 2020-2024 Apigrate LLC
  Copyright 2024 MSPortal (v3 enhancements)

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
const debug = require('debug')('autotask:restapi');
const verbose = require('debug')('autotask:restapi:verbose');
const https = require('https');
const crypto = require('crypto');

/** Default retry configuration */
const DEFAULT_RETRY_OPTIONS = {
  enabled: true,
  attempts: 10,
  delay: 1000,
  delay_factor: 2,
  retryOnStatuses: [429, 500, 502, 503, 504]
};

/**
 * Autotask REST API NodeJS connector.
 *
 * This class provides a simple interface to the Autotask REST API.
 */
class AutotaskRestApi {
  /**
   * Create an Autotask Rest API connector instance.
   * @param {string} user Autotask API user identifier (required)
   * @param {string} secret Autotask API secret associated with the user (required)
   * @param {string} code Autotask API integration tracking code (required)
   * @param {object} options
   * @param {string} options.base_url the REST API base url. (Default https://webservices2.autotask.net/ATServicesRest/)
   * @param {string} options.version Autotask REST API decimal version (e.g. 1.0). (Default 1.0)
   * @param {object} options.retry Retry configuration for rate-limited and server error responses
   * @param {boolean} options.retry.enabled Enable automatic retries (Default: true)
   * @param {number} options.retry.attempts Maximum retry attempts (Default: 10)
   * @param {number} options.retry.delay Initial delay in ms between retries (Default: 1000)
   * @param {number} options.retry.delay_factor Exponential backoff multiplier (Default: 2)
   * @param {number[]} options.retry.retryOnStatuses HTTP status codes to retry on (Default: [429, 500, 502, 503, 504])
   */
  constructor(user, secret, code, options){
    if(!user)throw new Error(`An API user is required.`);
    if(!secret) throw new Error(`An API user secret is required.`);
    if(!code) throw new Error(`An API integration code is required.`);

    this.user = user;
    this.secret = secret;
    this.code = code;

    this.base_url = `https://webservices.autotask.net/ATServicesRest/`; //As returned by zoneInformation.url
    this.version = '1.0';

    // Initialize retry options with defaults
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS };

    if(options){
      if(options.base_url){
        this.base_url = options.base_url;
      }
      if(options.version){
        this.version = options.version;
      }
      // Merge retry options
      if(options.retry){
        this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options.retry };
      }
    }

    //read-only. See the init method.
    this.zoneInfo = null;
    this.available_entities=[
      {name: "zoneInformation" },
      {name:'ActionTypes'},
      {name:'AdditionalInvoiceFieldValues'},
      {name:'Appointments'},
      {name:'AttachmentInfo'},
      {name:'ProjectCharges'},
      {name:'BillingCodes'},
      {name:'BillingItems'},
      {name:'BillingItemApprovalLevels'},
      {name:'ChangeOrderCharges'},
      {name:'ChangeRequestLinks'},
      {name:'ChecklistLibraries'},
      {name:'ChecklistLibraryChecklistItems', childOf: 'ChecklistLibraries', subname: 'ChecklistItems'},
      {name:'ClassificationIcons'},
      {name:'ClientPortalUsers'},
      {name:'ComanagedAssociations'},
      {name:'Companies'},
      {name:'CompanyAlerts', childOf: 'Companies', subname: 'Alerts'},
      {name:'CompanyAttachments', childOf: 'Companies', subname: 'Attachments'},
      {name:'CompanyContacts', childOf: 'Companies', subname: 'Contacts'},
      {name:'CompanyLocations', childOf: 'Companies', subname: 'Locations'},
      {name:'CompanyNotes', childOf: 'Companies', subname: 'Notes'},
      {name:'CompanySiteConfigurations', childOf: 'Companies', subname: 'SiteConfigurations'},
      {name:'CompanyTeams', childOf: 'Companies', subname: 'Teams'},
      {name:'CompanyToDos', childOf: 'Companies', subname: 'ToDos'},
      {name:'CompanyWebhooks'},
      {name:'CompanyWebhookExcludedResources', childOf: 'CompanyWebhooks', subname: 'ExcludedResources'},
      {name:'CompanyWebhookFields', childOf: 'CompanyWebhooks', subname: 'Fields'},
      {name:'CompanyWebhookUdfFields', childOf: 'CompanyWebhoosk', subname: 'UdfFields'},
      {name:'ConfigurationItems'},
      {name:'ConfigurationItemAttachments', childOf: 'ConfigurationItems', subname: 'Attachments'},
      {name:'ConfigurationItemBillingProductAssociations', childOf: 'ConfigurationItems', subname: 'BillingProductAssociations'},
      {name:'ConfigurationItemCategories'},
      {name:'ConfigurationItemCategoryUdfAssociations', childOf: 'ConfigurationItemCategories', subname: 'UdfAssociations'},
      {name:'ConfigurationItemNotes', childOf: 'ConfigurationItems', subname: 'Notes'},
      {name:'ConfigurationItemNoteAttachments', childOf: 'ConfigurationItemNotes', subname: 'Attachments'},
      {name:'ConfigurationItemTypes'},
      {name:'Contacts'},
      {name:'ContactBillingProductAssociations', childOf: 'Contacts', subname: 'BillingProductAssociationis'},
      {name:'ContactGroups'},
      {name:'ContactGroupContacts', childOf: 'ContactGroups', subname: 'Contacts'},
      {name:'ContactWebhooks'},
      {name:'ContactWebhookExcludedResources', childOf: 'ContactWebhooks', subname: 'ExcludedResources'},
      {name:'ContactWebhookFields', childOf: 'ContactWebhooks', subname: 'Fields'},
      {name:'ContactWebhookUdfFields', childOf: 'ContactWebhooks', subname: 'UdfFields'},
      {name:'Contracts'},
      {name:'ContractBillingRules', childOf: 'Contracts', subname: 'BillingRules'},
      {name:'ContractBlocks', childOf: 'Contracts', subname: 'Blocks'},
      {name:'ContractBlockHourFactors', childOf: 'Contracts', subname: 'BlockHourFactors'},
      {name:'ContractCharges', childOf: 'Contracts', subname: 'Charges'},
      {name:'ContractExclusionBillingCodes', childOf: 'Contracts', subname: 'ExclusionBillingCodes'},
      {name:'ContractExclusionRoles', childOf: 'Contracts', subname: 'ExclusionRoles'},
      {name:'ContractExclusionSets'},
      {name:'ContractExclusionSetExcludedRoles', childOf: 'ContractExclusionSets', subname: 'ExcludedRoles'},
      {name:'ContractExclusionSetExcludedWorkTypes', childOf: 'ContractExclusionSets', subname: 'ExcludedWorkTypes'},
      {name:'ContractMilestones', childOf: 'Contracts', subname: 'Milestones'},
      {name:'ContractNotes', childOf: 'Contracts', subname: 'Notes'},
      {name:'ContractRates', childOf: 'Contracts', subname: 'Rates'},
      {name:'ContractRetainers', childOf: 'Contracts', subname: 'Retainers'},
      {name:'ContractRoleCosts', childOf: 'Contracts', subname: 'RoleCosts'},
      {name:'ContractServices', childOf: 'Contracts', subname: 'Services'},
      {name:'ContractServiceAdjustments', childOf: 'Contracts', subname: 'ServiceAdjustments'},
      {name:'ContractServiceBundles', childOf: 'Contracts', subname: 'ServiceBundles'},
      {name:'ContractServiceBundleAdjustments', childOf: 'Contracts', subname: 'ServiceBundleAdjustments'},
      {name:'ContractServiceBundleUnits', childOf: 'Contracts', subname: 'ServiceBundleUnits'},
      {name:'ContractServiceUnits', childOf: 'Contracts', subname: 'ServiceUnits'},
      {name:'ContractTicketPurchases', childOf: 'Contracts', subname: 'TicketPurchases'},
      {name:'Countries'},
      {name:'Currencies'},
      {name:'Departments'},
      {name:'Expenses'},
      {name:'ExpenseItems', childOf: 'Expenses', subname: 'Items'},
      {name:'ExpenseReports'},
      {name:'Holidays', childOf: 'HolidaySets', subname: 'Holidays'},
      {name:'HolidaySets'},
      {name:'InternalLocations'},
      {name:'InternalLocationWithBusinessHours'},
      {name:'InventoryItems'},
      {name:'InventoryItemSerialNumbers', childOf: 'InventoryItems', subname: 'SerialNumbers'},
      {name:'InventoryLocations'},
      {name:'InventoryTransfers'},
      {name:'Invoices'},
      {name:'InvoiceTemplates'},
      {name:'Modules'},
      {name:'NotificationHistory'},
      {name:'Opportunities'},
      {name:'OpportunityAttachments', childOf: 'Opportunities', subname: 'Attachments'},
      {name:'OrganizationalLevel1s'},
      {name:'OrganizationalLevel2s'},
      {name:'OrganizationalLevelAssociations'},
      {name:'OrganizationalResources', childOf: 'OrganizationalLevelAssociations', subname: 'Resources'},
      {name:'PaymentTerms'},
      {name:'Phases', childOf: 'Projects', subname: 'Phases'},
      {name:'PriceListMaterialCodes'},
      {name:'PriceListProducts'},
      {name:'PriceListProductTiers'},
      {name:'PriceListRoles'},
      {name:'PriceListServices'},
      {name:'PriceListServiceBundles'},
      {name:'PriceListWorkTypeModifiers'},
      {name:'Products'},
      {name:'ProductNotes', childOf: 'Products', subname: 'Notes'},
      {name:'ProductTiers', childOf: 'Products', subname: 'Tiers'},
      {name:'ProductVendors', childOf: 'Products', subname: 'Vendors'},
      {name:'Projects'},
      {name:'ProjectAttachments', childOf: 'Projects', subname: 'Attachments'},
      {name:'ProjectCharges', childOf: 'Projects', subname: 'Charges'},
      {name:'ProjectNotes', childOf: 'Projects', subname: 'Notes'},
      {name:'PurchaseApprovals'},
      {name:'PurchaseOrders'},
      {name:'PurchaseOrderItems', childOf: 'PurchaseOrders', subname: 'Items'},
      {name:'PurchaseOrderItemReceiving', childOf: 'PurchaseOrderItems', subname: 'Receiving'},
      {name:'Quotes'},
      {name:'QuoteItems', childOf: 'Quotes', subname: 'Items'},
      {name:'QuoteLocations'},
      {name:'QuoteTemplates'},
      {name:'Resources'},
      {name:'ResourceRoles'},
      {name:'ResourceRoleDepartments', childOf: 'Resources', subname: 'RoleDepartments'},
      {name:'ResourceRoleQueues', childOf: 'Resources', subname: 'RoleQueues'},
      {name:'ResourceServiceDeskRoles', childOf: 'Resources', subname: 'ServiceDeskRoles'},
      {name:'ResourceSkills', childOf: 'Resources', subname: 'Skills'},
      {name:'Roles'},
      {name:'SalesOrders', childOf: 'Opportunities', subname: 'SalesOrders'},
      {name:'Services'},
      {name:'ServiceBundles'},
      {name:'ServiceBundleServices', childOf: 'ServiceBundles', subname: 'Services'},
      {name:'ServiceCalls'},
      {name:'ServiceCallTasks', childOf: 'ServiceCalls', subname: 'Tasks'},
      {name:'ServiceCallTaskResources', childOf: 'ServiceCallTasks', subname: 'Resources'},
      {name:'ServiceCallTickets', childOf: 'ServiceCalls', subname: 'Tickets'},
      {name:'ServiceCallTicketResources', childOf: 'ServiceCallTickets', subname: 'Resources'},
      {name:'ServiceLevelAgreementResults', childOf: 'ServiceLevelAgreements', subname: 'Results'},
      {name:'ShippingTypes'},
      {name:'Skills'},
      {name:'Subscriptions'},
      {name:'SubscriptionPeriods', childOf: 'Subscriptions', subname: 'Periods'},
      {name:'Surveys'},
      {name:'SurveyResults'},
      {name:'Tasks', childOf: 'Projects', subname: 'Tasks'},
      {name:'TaskAttachments', childOf: 'Tasks', subname: 'Attachments'},
      {name:'TaskNotes', childOf: 'Tasks', subname: 'Notes'},
      {name:'TaskNoteAttachments', childOf: 'TaskNotes', subname: 'Attachments'},
      {name:'TaskPredecessors', childOf: 'Tasks', subname: 'Predecessors'},
      {name:'TaskSecondaryResources', childOf: 'Tasks', subname: 'SecondaryResources'},
      {name:'Taxes'},
      {name:'TaxCategories'},
      {name:'TaxRegions'},
      {name:'ThresholdInformation'},
      {name:'Tickets'},
      {name:'TicketAdditionalConfigurationItems', childOf: 'Tickets', subname: 'AdditionalConfigurationItems'},
      {name:'TicketAdditionalContacts', childOf: 'Tickets', subname: 'AdditionalContacts'},
      {name:'TicketAttachments', childOf: 'Tickets', subname: 'Attachments'},
      {name:'TicketCategories'},
      {name:'TicketCategoryFieldDefaults', childOf: 'TicketCategories', subname: 'FieldDefaults'},
      {name:'TicketChangeRequestApprovals', childOf: 'Tickets', subname: 'ChangeRequestApprovals'},
      {name:'TicketCharges', childOf: 'Tickets', subname: 'Charges'},
      {name:'TicketChecklistItems', childOf: 'Tickets', subname: 'ChecklistItems'},
      {name:'TicketChecklistLibraries', childOf: 'Tickets', subname: 'ChecklistLibraries'},
      {name:'TicketHistory'},
      {name:'TicketNotes', childOf: 'Tickets', subname: 'Notes'},
      {name:'TicketNoteAttachments', childOf: 'TicketNotes', subname: 'Attachments'},
      {name:'TicketRmaCredits', childOf: 'Tickets', subname: 'RmaCredits'},
      {name:'TicketSecondaryResources', childOf: 'Tickets', subname: 'SecondaryResources'},
      {name:'TimeEntries'},
      {name:'TimeEntryAttachments', childOf: 'TimeEntries', subname: 'Attachments'},
      {name:'UserDefinedFieldDefinitions'},
      {name:'UserDefinedFieldListItems', childOf: 'UserDefinedFields', subname: 'ListItems'},//note, no parent native entity
      {name:'WebhookEventErrorLogs'},
      {name:'WorkTypeModifiers'},
      {name:'ZoneInformation'},
    ];

    // connector initialization
    // this.connector = {};
    for(let entity of this.available_entities){
        
      let missingEntityErrorMsg = `No ${entity.name} parameter was provided. Please provide the ${entity.name} data.`;
      let missingIdErrorMessage = `The 'id' parameter is required. Please provide the ${entity.subname} id.`;
        
      this[entity.name] = {
        parent: entity.childOf,
        isChild: entity.childOf ? true : false,

        query : async (search)=>{
          if(entity.name==='Modules') return await this._get(`/${entity.name}`);
          return await this._post(`/${entity.name}/query`, search);
        },

        count : async (search)=>{
          return await this._post(`/${entity.name}/query/count`, search);
        },

        get : async (id)=>{
          if(entity.name==='Modules') return await this._get(`/${entity.name}`);
          return await this._get(`/${entity.name}/${id}`);
        },

        update : async (toSave, opts)=>{
          if(!toSave) throw new Error(`${missingEntityErrorMsg}`);
          return await this._patch(`/${entity.name}`, toSave, opts);
        },

        create : async (toSave, opts)=>{
          if(!toSave) throw new Error(`${missingEntityErrorMsg}`);
          return await this._post(`/${entity.name}`, toSave, opts);
        },

        delete : async (id)=>{
          if(!id) throw new Error(`${missingIdErrorMessage}`);
          return await this._delete(`/${entity.name}/${id}`);
        },

        //missing properties set to null!
        replace : async (toSave, opts)=>{
          if(!toSave) throw new Error(`${missingEntityErrorMsg}`);
          return await this._put(`/${entity.name}`, toSave, opts);
        },

        info: async ()=>{
          return await this._get(`/${entity.name}/entityInformation`);
        },

        fieldInfo: async ()=>{
          return await this._get(`/${entity.name}/entityInformation/fields`);
        },

        udfInfo: async ()=>{
          return await this._get(`/${entity.name}/entityInformation/userDefinedFields`);
        },

        /**
         * Fetch all records across multiple pages automatically using ID-based pagination.
         * @param {object} search Query parameters (filter, includeFields, etc.)
         * @param {object} options Pagination options
         * @param {number} options.maxPages Maximum pages to fetch (default: 100)
         * @param {function} options.onPage Callback called for each page: (items, pageNum, totalSoFar) => void
         * @param {AbortSignal} options.signal Optional AbortSignal to cancel pagination
         * @returns {Promise<{items: Array, pageDetails: {count: number, pagesRetrieved: number}}>}
         */
        queryAll: async (search = {}, options = {}) => {
          if(entity.name === 'Modules') {
            // Modules doesn't support query, just return the single result
            const result = await this._get(`/${entity.name}`);
            return { items: result?.modules || [], pageDetails: { count: result?.modules?.length || 0, pagesRetrieved: 1 } };
          }

          const maxPages = options.maxPages ?? 100;
          const allItems = [];
          let lastId = 0;
          let pageNum = 0;

          while (pageNum < maxPages) {
            // Check for abort signal
            if (options.signal?.aborted) {
              break;
            }

            // Build filter with id > lastId for pagination
            const paginatedSearch = {
              ...search,
              filter: [
                ...(search.filter || []),
                { field: 'id', op: 'gt', value: lastId }
              ]
            };

            const response = await this._post(`/${entity.name}/query`, paginatedSearch);
            const items = response?.items || [];

            if (items.length === 0) break;

            allItems.push(...items);
            lastId = items[items.length - 1].id;
            pageNum++;

            // Call progress callback if provided
            if (options.onPage) {
              await options.onPage(items, pageNum, allItems.length);
            }

            // If we got less than 500 items, we've reached the end
            if (items.length < 500) break;
          }

          return {
            items: allItems,
            pageDetails: {
              count: allItems.length,
              pagesRetrieved: pageNum
            }
          };
        },

        /**
         * Async generator for memory-efficient pagination through large datasets.
         * @param {object} search Query parameters (filter, includeFields, etc.)
         * @param {object} options Pagination options
         * @param {number} options.maxPages Maximum pages to fetch (default: 100)
         * @yields {{items: Array, pageNum: number, pageDetails: object}}
         */
        queryPaginated: async function* (search = {}, options = {}) {
          if(entity.name === 'Modules') {
            const result = await this._get(`/${entity.name}`);
            yield { items: result?.modules || [], pageNum: 1, pageDetails: { count: result?.modules?.length || 0 } };
            return;
          }

          const maxPages = options.maxPages ?? 100;
          let lastId = 0;
          let pageNum = 0;

          while (pageNum < maxPages) {
            // Build filter with id > lastId for pagination
            const paginatedSearch = {
              ...search,
              filter: [
                ...(search.filter || []),
                { field: 'id', op: 'gt', value: lastId }
              ]
            };

            const response = await this._post(`/${entity.name}/query`, paginatedSearch);
            const items = response?.items || [];

            if (items.length === 0) break;

            lastId = items[items.length - 1].id;
            pageNum++;

            yield {
              items,
              pageNum,
              pageDetails: response?.pageDetails || { count: items.length }
            };

            // If we got less than 500 items, we've reached the end
            if (items.length < 500) break;
          }
        }.bind(this),
      };

      //Adjust endpoints for child entities.
      if(entity.childOf){
        let missingParentIdErrorMsg = `${entity.name} are children of ${entity.childOf}. Please provide the id of the ${entity.childOf} entity as the first parameter. It must be an integer.`;
        let missingEntityErrorMsg = `No ${entity.subname} was provided. Please provide the ${entity.subname} data as the second parameter.`;
        let missingIdErrorMessage = `The 'id' parameter is required. Please provide the ${entity.subname} id as the second parameter. It must be an integer.`;

        // Attachment child entities require special handling...
        if([
          'ConfigurationItemAttachments',
          'ConfigurationItemNoteAttachments',
          'OpportunityAttachments',
          'TaskAttachments',
          'TaskNoteAttachments',
          'TicketAttachments',
          'TicketNoteAttachments',
          'TimeEntryAttachments'
        ].includes(entity.name)){
          this[entity.name].get = async (parentId, id)=>{
            if(typeof parentId !== 'number') throw new Error(`${missingParentIdErrorMsg}`);
            if(id === null || typeof id === 'undefined' ) throw new Error(`${missingIdErrorMessage}`);
            //This is the only attachment endpoint that returns the base64 encoded data. Other approaches yield `null` for the `data` property
            return await this._get(`/${entity.childOf}/${parentId}/${entity.subname}/${id}`);
          };
        }

        //create, update, replace, and delete have different signatures
        this[entity.name].update = async (parentId, toSave, opts)=>{
          if(typeof parentId !== 'number') throw new Error(`${missingParentIdErrorMsg}`);
          if(!toSave) throw new Error(`${missingEntityErrorMsg}`);
          return await this._patch(`/${entity.childOf}/${parentId}/${entity.subname}`, toSave, opts);
        };
        
        this[entity.name].create = async (parentId, toSave, opts)=>{
          if(typeof parentId !== 'number') throw new Error(`${missingParentIdErrorMsg}`);
          if(!toSave) throw new Error(`${missingEntityErrorMsg}`);
          return await this._post(`/${entity.childOf}/${parentId}/${entity.subname}`, toSave, opts);
        };

        this[entity.name].delete = async (parentId, id)=>{
          if(typeof parentId !== 'number') throw new Error(`${missingParentIdErrorMsg}`);
          if(id === null || typeof id === 'undefined' ) throw new Error(`${missingIdErrorMessage}`);
          return await this._delete(`/${entity.childOf}/${parentId}/${entity.subname}/${id}`);
        };

        this[entity.name].replace = async (parentId, toSave, opts)=>{
          if(typeof parentId !== 'number') throw new Error(`${missingParentIdErrorMsg}`);
          if(!toSave) throw new Error(`${missingEntityErrorMsg}`);
          return await this._put(`/${entity.childOf}/${parentId}/${entity.subname}`, toSave, opts);
        };
      }

    }
  }

  /** lookup/query an entity */
  async _get(endpoint, query){
    return await this._fetch('GET', endpoint, query);
  }
  /** delete an entity */
  async _delete(endpoint, query){
    return await this._fetch('DELETE', endpoint, query);
  }
  /** sparse update an entity */
  async _patch(endpoint, payload, opts){
    return await this._fetch('PATCH', endpoint, null, payload, opts);
  }
  /** full update an entity */
  async _put(endpoint, payload, opts){
    return await this._fetch('PUT', endpoint, null, payload, opts);
  }
  /** create an entity */
  async _post(endpoint, payload, opts){
    return await this._fetch('POST', endpoint, null, payload, opts);
  }

  /**
   * Handles HTTP API calls.
   * @param {string} method GET, POST, PUT, PATCH or DELETE
   * @param {string} endpoint beginning with a / appended to the base url
   * @param {object} query hash of query parameters, if applicable
   * @param {object} payload to be converted to JSON, if provided 
   * @param {object} opts additional options (typically omitted)
   * @param {boolean} opts.omit_credentials omits the credentials on the request.
   * @param {boolean} opts.ImpersonationResourceId specifies an Autotask Resource ID to impersonate on a create/update operation
   */
  async _fetch(method, endpoint, query, payload, opts){
    try{
      if(!this.zoneInfo){
        //Lazy init zone info on the fly.
        try {
          let autotaskZoneInfoResponse = await fetch(
            `${this.base_url}v${this.version}/zoneInformation?user=${encodeURIComponent(this.user)}`
          );
          if(autotaskZoneInfoResponse.ok){
            this.zoneInfo = await autotaskZoneInfoResponse.json();
            verbose(`Zone Information: ${JSON.stringify(this.zoneInfo)}`);
          } else {
            console.error(`Error fetching zone information: HTTP-${autotaskZoneInfoResponse.status}`);
          }
        } catch (err) {
          console.error(`Error fetching zone information: ${err}`);
        }
      }

      let fetchParms = {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Apigrate/1.0 autotask-restapi NodeJS connector"
        }
      };
      if(opts && opts.omit_credentials){
      } else {
        fetchParms.headers.ApiIntegrationcode = this.code;
        fetchParms.headers.UserName = this.user;
        fetchParms.headers.Secret = this.secret;
      }
      if(opts && opts.ImpersonationResourceId){
        fetchParms.headers.ImpersonationResourceId = opts.ImpersonationResourceId;
      }
      if(payload) fetchParms.body = JSON.stringify(payload);
      
      let querystring = '';
      if(query){
        for(let parmname in query){
          if(typeof query[parmname] !== 'undefined'){
            querystring += `&${parmname}=${encodeURIComponent(query[parmname])}`;
          }  
        }
        if(querystring.startsWith('&')) querystring=`?${querystring.substring(1)}`
      };

      let full_url = `${this.zoneInfo ? this.zoneInfo.url : this.base_url}V${this.version}${endpoint}${querystring}`;
      debug(`${method}: ${full_url}`);
      if(payload) verbose(`  sending: ${JSON.stringify(payload)}`);

      // Added until Autotask servers support RI (IIS issue). Ref: https://stackoverflow.com/questions/74324019/allow-legacy-renegotiation-for-nodejs
      fetchParms.agent = new https.Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT
      });

      // Retry wrapper with exponential backoff for rate-limited and server error responses
      let attempts = 0;
      const fetchWithRetry = async () => {
        attempts++;
        let response = await fetch(`${full_url}`, fetchParms);

        if (response.ok) {
          return response;
        }

        // Check if we should retry this status code
        const shouldRetry = this.retryOptions.enabled &&
          attempts < this.retryOptions.attempts &&
          this.retryOptions.retryOnStatuses.includes(response.status);

        if (shouldRetry) {
          const delay = this.retryOptions.delay * Math.pow(this.retryOptions.delay_factor, attempts - 1);
          debug(`  Rate limited or server error (HTTP-${response.status}). Retry ${attempts}/${this.retryOptions.attempts} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry();
        }

        return response;
      };

      let response = await fetchWithRetry();

      if(response.ok){
        // Guard against non-JSON responses (e.g. CDN/WAF challenge pages returning HTML with HTTP 200)
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const htmlBody = await response.text();
          const preview = htmlBody.substring(0, 200);
          debug(`  ...Error: received HTML instead of JSON (content-type: ${contentType})`);
          throw new AutotaskApiError(
            `Autotask API returned HTML instead of JSON (HTTP ${response.status}). ` +
            `This usually means a CDN/WAF challenge page, API maintenance, or incorrect zone URL. ` +
            `Response preview: ${preview}`,
            response.status,
            { html: preview }
          );
        }

        let result = await response.json();
        debug(`...ok. (HTTP ${response.status})${attempts > 1 ? ` after ${attempts} attempts` : ''}`);
        verbose(`  received: ${JSON.stringify(result)}`);
        return result;
      } else {
        debug(`  ...Error. HTTP-${response.status}${attempts > 1 ? ` after ${attempts} attempts` : ''}`);
        let result = null;
        let text = await response.text();
        // Usually JSON is returned, but not always, so...
        try{
          result = JSON.parse(text);
          verbose(`  response payload: ${JSON.stringify(result)}`);
        }catch(err){
          //Can't parse json. Just use text.
          result = text;
          verbose(`  response payload: ${text}`);
        }

        verbose(result);

        if (response.status >=300 & response.status < 400){
          verbose(` redirection.`);

        } else if(response.status === 401 || response.status === 403){
          verbose(` authorization error.`);
          throw new AutotaskApiError('Authorization error.', response.status, result);

        } else if(response.status === 404){
          // Not an "error" from the standpoint of processing. Return null for any not-found responses.
          verbose(`  not found.`);
          return null;

        } else if (response.status >= 400 && response.status < 500){
          verbose(`  client error.`);
          throw new AutotaskApiError(`Client error (HTTP-${response.status}). ${text}`, response.status, result);

        } else if (response.status >=500) {
          verbose(`  server error.`);
          throw new AutotaskApiError(`Server error (HTTP-${response.status}). ${text}`, response.status, result);

        } else {
          throw err; //Cannot be handled here.
        }
        return result;
      }
    }catch(ex){
      if(ex instanceof AutotaskApiError){
        //rethrow only
      } else {
        //log
        console.error(ex);
      }
      throw ex;
    }
  }

}

/**
 * Extends errors, allow you to parse HTTP status and get details about REST API errors.
 */
class AutotaskApiError extends Error {
  /**
   * 
   * @param {string} message 
   * @param {number} status HTTP status code
   * @param {string|object} details typically a JSON object returned from the server with details about the error.
   */
  constructor(message, status, details){
    super(message)
    this.status = status;
    this.details = details;
  }
}

exports.FilterOperators = {
  /** Requires that the field value match the exact criteria provided */
  eq: "eq",
  /** Requires that the field value be anything other than the criteria provided */
  noteq: "noteq",
  /** Requires that the field value be greater than the criteria provided */
  gt: "gt",
  /** Requires that the field value be greater than or equal to the criteria provided */
  gte: "gte",
  /** Requires that the field value be less than the criteria provided */
  lt: "lt",
  /** Requires that the field value be less than or equal to the criteria provided */
  lte: "lte",
  /**	Requires that the field value begin with the defined criteria */
  beginsWith: "beginsWith",
  /** Requires that the field value end with the defined criteria */
  endsWith: "endsWith",
  /** Allows for the string provided as criteria to match any resource that contains the string in its value */
  contains: "contains",
  /**	Enter exist to query for fields in which the data you specify is not null. */
  exist: "exist",
  /** Enter notExist to query for fields in which the specified data is null */
  notExist: "notExist",
  /** With this value specified, the query will return only the values in the list array that match the field value you specify */
  in: "in",
  /** With this value specified, the query will only return the values in the list array that do not match the field value you specify */
  notIn: "notIn",
};
exports.AutotaskRestApi = AutotaskRestApi;
exports.AutotaskApiError = AutotaskApiError;
