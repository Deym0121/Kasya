import type { NavigatorScreenParams, CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { GaitReportRecord } from './storage/reportRecord';
import { PoseFrame } from './gait/types';

/**
 * Which camera angle a capture screen is set up for. 'rear' is web-internal:
 * the web scan runs its rear pass in-screen — no route ever navigates
 * CameraGuide/PoseScan with view:'rear', and native has no rear pass.
 */
export type ScanView = 'side' | 'rear';

/** The bottom tab bar (the authed hub). Scanning lives on a corner FAB, not a tab. */
export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};

/**
 * Root stack: auth screens + the tab hub + every full-screen flow (scan,
 * result, review, matches, paywall) pushed OVER the tabs so the tab bar hides.
 */
export type RootStackParamList = {
  Onboarding: undefined;
  SignIn: undefined;
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  ScanSetup: undefined;
  CameraGuide: { goal: string; view?: ScanView; sideFrames?: PoseFrame[] };
  PoseScan: { goal: string; view?: ScanView; sideFrames?: PoseFrame[] };
  /**
   * frontalFrames only ever arrives WITH frames (the web rear pass). A
   * rear-only payload is treated as a failed capture by Processing — never
   * paired with a synthesized side walk.
   */
  Processing: { goal: string; frames?: PoseFrame[]; frontalFrames?: PoseFrame[] };
  Result: { report: GaitReportRecord };
  Review: { report: GaitReportRecord };
  Coach: { report: GaitReportRecord };
  ShoeMatches: { report: GaitReportRecord };
  Share: { report: GaitReportRecord };
  Paywall: undefined;
};

/** Props for root-stack screens (scan flow, Result, Paywall, Onboarding, SignIn). */
export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/** Props for tab screens — composite so navigate('ScanSetup') etc. bubbles to the root stack. */
export type TabScreenProps<T extends keyof MainTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;
