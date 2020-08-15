import { AppTheme, Project } from 'src/types';
import { ITextField, mergeStyleSets } from '@fluentui/react';
import {
    MotionAnimations,
    MotionDurations,
    MotionTimings,
} from '@uifabric/fluent-theme';
import React, { Component } from 'react';
import { Subscription, fromEvent, merge, partition } from 'rxjs';

import ProjectList from 'src/components/PomList';
import { RootState } from 'src/redux/store/types';
import Snackbar from 'src/components/Snackbar';
import TextFilter from 'src/components/TextFilter';
import { appActions } from 'src/redux/features/app';
import { connect } from 'react-redux';
import { ipcRenderer } from 'electron';
import { openProject } from 'src/utils/open';
import { throttleTime } from 'rxjs/operators';

const PAGE_SIZE = 9;

interface State {
    filterText: string;
    filteredProjects: Project[] | null;
    projectCount: number | null;
    cursor: number;
}

interface Props {
    theme: AppTheme;
    windowVisible: boolean;
    setWindowVisible: (value: boolean) => void;
}

class Home extends Component<Props, State> {
    public state: State = {
        filterText: '',
        projectCount: null,
        filteredProjects: null,
        cursor: 0,
    };

    private homeDivRef = React.createRef<HTMLDivElement>();
    private textFilterRef = React.createRef<ITextField>();

    private keyHandlerSubscription: Subscription | undefined;

    public render() {
        // if (!this.props.setupComplete) {
        //     return <Redirect to='/setup/start' />;
        // }
        const { filteredProjects, filterText, projectCount } = this.state;
        const { cursor } = this.state;
        if (projectCount === null || filteredProjects === null) {
            return null;
        }
        const classes = buildClasses();
        return (
            <div className={classes.root} ref={this.homeDivRef}>
                <TextFilter
                    projectCount={projectCount}
                    filterText={filterText}
                    filterTextChange={(ft) => this.setState({ filterText: ft })}
                    ref={this.textFilterRef}
                />
                <ProjectList
                    cursor={cursor}
                    projects={filteredProjects}
                    onAnyContextMenuClosed={this.focusTextFilterInput}
                />
                <Snackbar />
            </div>
        );
    }

    public componentWillMount() {
        this._setupFilteredProjectsListener();
        this._requestFilteredProjects(this.state.filterText);
        this._requestProjectCount();
    }

    public componentDidUpdate = (_oldProps: Props, oldState: State) => {
        if (oldState.filterText !== this.state.filterText) {
            this._requestFilteredProjects(this.state.filterText);
        }
        if (!_oldProps.windowVisible && !!this.props.windowVisible) {
            !!this.state.filterText
                ? this.setState({ filterText: '' })
                : this._requestFilteredProjects(this.state.filterText);
        }
        if (!!this.homeDivRef.current && !this.keyHandlerSubscription) {
            const [arrow$, other$] = partition(
                fromEvent<KeyboardEvent>(this.homeDivRef.current, 'keydown'),
                (event) =>
                    event.key === 'ArrowUp' ||
                    event.key === 'ArrowDown' ||
                    event.key === 'PageUp' ||
                    event.key === 'PageDown'
            );
            this.keyHandlerSubscription = merge(
                arrow$.pipe(throttleTime(50)),
                other$
            ).subscribe(this.handleKeyEvent);
        }
    };

    public componentWillUnmount() {
        if (!!this.keyHandlerSubscription) {
            this.keyHandlerSubscription.unsubscribe();
        }
        this._closeListeners();
    }

    private _onWindowHide = () => {
        this.setState({ filterText: '' });
        this.props.setWindowVisible(false);
    };

    private _requestProjectCount = () => {
        ipcRenderer.send('requestProjectCount');
    };

    private _requestFilteredProjects = (filterText: string) => {
        ipcRenderer.send('requestFilteredProjects', filterText);
    };

    private _setupFilteredProjectsListener = () => {
        ipcRenderer.on('filteredProjects', this._filteredProjects);
        ipcRenderer.on('projectCount', this._projectCount);
        ipcRenderer.on('scanPathComplete', this._scanPathComplete);
    };

    private _closeListeners = () => {
        ipcRenderer.removeListener('filteredProjects', this._filteredProjects);
        ipcRenderer.removeListener('projectCount', this._projectCount);
        ipcRenderer.removeListener('scanPathComplete', this._scanPathComplete);
    };

    private _filteredProjects = (
        _event: Electron.IpcRendererEvent,
        filteredProjects: Project[]
    ) => {
        this.setState({ filteredProjects, cursor: 0 });
    };

    private _projectCount = (
        _event: Electron.IpcRendererEvent,
        projectCount: number
    ) => this.setState({ projectCount });

    private _scanPathComplete = () => {
        this._requestFilteredProjects(this.state.filterText);
        this._requestProjectCount();
    };

    private focusTextFilterInput = () => {
        if (!!this.textFilterRef.current) {
            this.textFilterRef.current.focus();
        }
    };

    private handleKeyEvent = (event: KeyboardEvent) => {
        const { filteredProjects, cursor } = this.state;
        if (event.key === 'ArrowUp' && cursor > 0) {
            event.preventDefault();
            this.setState({ cursor: cursor - 1 });
        } else if (
            event.key === 'ArrowDown' &&
            cursor < filteredProjects.length - 1
        ) {
            event.preventDefault();
            this.setState({ cursor: cursor + 1 });
        } else if (event.key === 'PageUp' && cursor > 0) {
            event.preventDefault();
            let newCursor = cursor - PAGE_SIZE;
            if (newCursor < 0) {
                newCursor = 0;
            }
            this.setState({ cursor: newCursor });
        } else if (
            event.key === 'PageDown' &&
            cursor < filteredProjects.length - 1
        ) {
            event.preventDefault();
            let newCursor = cursor + PAGE_SIZE;
            if (newCursor > filteredProjects.length - 1) {
                newCursor = filteredProjects.length - 1;
            }
            this.setState({ cursor: newCursor });
        } else if (event.key === 'Home') {
            event.preventDefault();
            this.setState({ cursor: 0 });
        } else if (event.key === 'End') {
            event.preventDefault();
            this.setState({ cursor: filteredProjects.length - 1 });
        } else if (
            event.key === 'Enter' &&
            !!this.state.filteredProjects.length
        ) {
            openProject(this.state.filteredProjects[this.state.cursor]);
        } else if (event.key === 'Escape') {
            this._onWindowHide();
        }
    };
}
const mapStateToProps = (state: RootState) => ({
    theme: state.app.theme,
    windowVisible: state.app.windowVisible,
});
const mapDispatchToProps = {
    setWindowVisible: appActions.setWindowVisible,
};
export default connect(mapStateToProps, mapDispatchToProps)(Home);
// Styles

const buildClasses = () => {
    return mergeStyleSets({
        root: {
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: MotionAnimations.slideUpIn,
            animationDuration: MotionDurations.duration3,
            animationTimingFunction: MotionTimings.decelerate,
        },
    });
};
