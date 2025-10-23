import * as vsc from 'vscode';
import * as Constants from './constants';
import { UserStoryInfo, AzureClient, IterationInfo, TeamMemberInfo } from './utils/azure-client';
import { Logger } from './utils/logger';
import { Stopwatch } from './utils/stopwatch';
import { Configuration } from './utils/config';
import { TextProcessor } from './utils/textProcessor';

const MissingUrlOrToken = 'Missing URL or token in configuration';

export class SessionStore implements ISessionStore {
    private currentIteration?: IterationInfo;
    private customIteration?: IterationInfo;
    private fetchingActivityTypes = false;
    private fetchingTags = false;
    private fetchingTeamMembers = false;

    public activityTypes?: string[];
    public iterations?: IterationInfo[];
    public userStories?: UserStoryInfo[] = undefined;
    public areas?: string[];
    public tags?: string[];
    public teamMembers?: TeamMemberInfo[];

    constructor(private azureClient: AzureClient, private config: Configuration, private logger: Logger) {
    }

    private async setCustomIteration(): Promise<void> {
        const editor = vsc.window.activeTextEditor;

        if (editor) {
            const lines = editor.document.getText().split(Constants.NewLineRegex);
            const it = TextProcessor.getIteration(lines, 0);
            if (!it) {
                this.customIteration = undefined;
                this.logger.log('Iteration not specified - will default to @CurrentIteration');
            } else {
                this.customIteration = this.iterations?.find(x => x.id === it.id);
                if (!this.customIteration) {
                    return Promise.resolve();
                }

                this.logger.log(`Iteration set to ${this.customIteration.path.toString()}`);
                vsc.window.setStatusBarMessage(`Iteration set to ${this.customIteration.path.toString()}`, 2000);
            }
        }

        return Promise.resolve();
    }

    async ensureHasActivityTypes(): Promise<void> {
        if (this.activityTypes !== undefined) {
            return Promise.resolve();
        }

        if (!this.config.isValid) {
            return Promise.reject(MissingUrlOrToken);
        }

        if (this.fetchingActivityTypes) {
            return Promise.reject();
        }

        this.fetchingActivityTypes = true;

        try {
            const total = Stopwatch.startNew();
            this.activityTypes = await this.azureClient.getActivityTypes();
            total.stop();

            this.logger.log(`Activity types fetched in ${total.toString()} (1 request)`);
        } catch (err) {
            this.fetchingActivityTypes = false;
            return Promise.reject(err);
        }

        this.fetchingActivityTypes = false;
        return Promise.resolve();
    }

    async ensureHasIterations(): Promise<void> {
        if (this.iterations !== undefined) {
            return Promise.resolve();
        }

        if (!this.config.isValid) {
            return Promise.reject(MissingUrlOrToken);
        }

        const total = Stopwatch.startNew();
        this.iterations = await this.azureClient.getIterationsInfo();
        total.stop();

        this.logger.log(`Iterations fetched in ${total.toString()} (1 request)`);
        vsc.window.setStatusBarMessage(`Iterations fetched in ${total.toString()} (1 request)`, 2000);

        return Promise.resolve();
    }

    async ensureHasAreas(): Promise<void> {
        if (this.areas !== undefined) {
            return Promise.resolve();
        }

        if (!this.config.isValid) {
            return Promise.reject(MissingUrlOrToken);
        }

        const total = Stopwatch.startNew();
        this.areas = await this.azureClient.getProjectAreas();
        total.stop();

        vsc.window.setStatusBarMessage(`Areas fetched in ${total.toString()} (1 request)`, 2000);

        return Promise.resolve();
    }

    async ensureHasUserStories(): Promise<void> {
        if (!this.config.isValid) {
            return Promise.reject(MissingUrlOrToken);
        }

        const total = Stopwatch.startNew();
        const iteration = await this.determineIteration();

        const workItemsIds = await this.azureClient.getIterationWorkItems(iteration.id);

        if (workItemsIds.length === 0) {
            this.logger.log('No user stories found in iteration');
            return Promise.reject();
        }

        this.userStories = await this.azureClient.getUserStoryInfo(workItemsIds.map(x => x.id));
        total.stop();

        this.logger.log(`User stories fetched in ${total.toString()} (3 requests)`);
        vsc.window.setStatusBarMessage(`User stories fetched in ${total.toString()} (3 requests)`, 2000);

        return Promise.resolve();
    }

    async ensureHasTags(): Promise<void> {
        if (this.tags !== undefined) {
            return Promise.resolve();
        }

        if (!this.config.isValid) {
            return Promise.reject(MissingUrlOrToken);
        }

        if (this.fetchingTags) {
            return Promise.reject();
        }

        this.fetchingTags = true;

        try {
            const total = Stopwatch.startNew();
            this.tags = await this.azureClient.getTags();
            total.stop();

            this.logger.log(`Tags fetched in ${total.toString()} (1 request)`);
        } catch (err) {
            this.fetchingTags = false;
            return Promise.reject(err);
        }

        this.fetchingTags = false;
        return Promise.resolve();
    }

    async ensureHasTeamMembers(): Promise<void> {
        if (this.teamMembers !== undefined) {
            return Promise.resolve();
        }

        if (!this.config.isValid) {
            return Promise.reject(MissingUrlOrToken);
        }

        if (this.fetchingTeamMembers) {
            return Promise.reject();
        }

        this.fetchingTeamMembers = true;

        try {
            const total = Stopwatch.startNew();
            this.teamMembers = await this.azureClient.getTeamMembers();
            total.stop();

            this.logger.log(`Team members fetched in ${total.toString()} (1 request)`);
        } catch (err) {
            this.fetchingTeamMembers = false;
            return Promise.reject(err);
        }

        this.fetchingTeamMembers = false;
        return Promise.resolve();
    }

    public async determineIteration(): Promise<IterationInfo> {
        this.setCustomIteration();

        if (!this.customIteration) {
            this.currentIteration = this.currentIteration || await this.azureClient.getCurrentIterationInfo();
            this.logger.log(`Iteration defaulted to ${this.currentIteration.path.toString()}`);
            return this.currentIteration;
        } else {
            this.currentIteration = undefined;
            return this.customIteration;
        }
    }
}

export interface ISessionStore {
    readonly activityTypes?: string[];
    readonly iterations?: IterationInfo[];
    readonly userStories?: UserStoryInfo[];
    readonly areas?: string[];
    readonly tags?: string[];
    readonly teamMembers?: TeamMemberInfo[];

    ensureHasActivityTypes(): Promise<void>;
    ensureHasIterations(): Promise<void>;
    ensureHasUserStories(): Promise<void>;
    ensureHasAreas(): Promise<void>;
    ensureHasTags(): Promise<void>;
    ensureHasTeamMembers(): Promise<void>;

    determineIteration(): Promise<IterationInfo>;
}
