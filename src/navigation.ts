import { GaitReportRecord } from './storage/reportRecord';

export type RootStackParamList = {
  Onboarding: undefined;
  SignIn: undefined;
  Home: undefined;
  ScanSetup: undefined;
  CameraGuide: { goal: string };
  Processing: { goal: string };
  Result: { report: GaitReportRecord };
  ShoeMatches: { report: GaitReportRecord };
  Paywall: undefined;
  Profile: undefined;
};
