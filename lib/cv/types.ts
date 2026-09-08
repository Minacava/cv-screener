export type CvExperience = {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  bullets: string[];
};

export type CvEducation = {
  institution: string;
  degree: string;
  field: string;
  graduationYear: string;
};

export type CvCandidate = {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  photoPromptHint: string;
};
