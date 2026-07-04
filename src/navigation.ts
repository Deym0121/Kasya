import type { NavigatorScreenParams, CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { GaitReportRecord } from './storage/reportRecord';
import { PoseFrame } from './gait/types';

/** Which camera angle a capture screen is set up for. */
export type ScanView = 'side' | 'rear';

/** The bottom tab bar (the authed hub). ScanTab is intercepted — never renders. */
export type MainTabParamList = {
  Home: undefined;
  ScanTab: undefined;
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
  Processing: { goal: string; frames?: PoseFrame[]; frontalFrames?: PoseFrame[] };
  Result: { report: GaitReportRecord };
  Review: { report: GaitReportRecord };
  Coach: { report: GaitReportRecord };
  ShoeMatches: { report: GaitReportRecord };
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
