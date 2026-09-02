import type { IntakeSchema } from './types';

const POLICIES_BODY = `Payment
Payment is always due the same day of the treatment/service. Cash and check are accepted in person, or credit cards through our online booking platform. If you have insurance that may or may not cover treatment payment is still due at the time of service. We will provide you with any necessary information for you to fill your claim.

Insurance
If you are a member of an insurance company that covers your treatments, you are responsible for the co-payment at the time of service. Please be aware that if the insurance claim is not paid in full or is denied, you must pay the remaining portion of the bill within 60 days of service.

Cancellation
If you need to cancel an appointment, you must give at least 24 hours notice unless of an emergency. If cancelled last minute or fail to show, a fee of $50 will be owed and added to your next charge.

Confidentiality
At Minnekyda Acuherb Center, we are committed to protecting your privacy and the confidentiality of your medical records. We have designed a comprehensive program to train our staff on both federal requirements and the ethical handling of your personal information.

Reimbursement
Treatments at Minnekyda Acuherb Center are non-refundable. Discounted packages will be reimbursed at the standard rates. If there is a balance from an insurance payment, the difference will be refunded to you.

Release of Records
Your medical records are the physical property of Minnekyda Acuherb Center. However, the information contained in the records belong to you and will only be released to other providers with your written consent.

You have the right to:
• Review and request a copy of the information used to design and carry out your treatments
• Ask us to amend the information which you feel is wrong or incorrect
• Ask us to restrict the information we share about you
• Ask us to communicate with you in a certain way or platform
• Request a list of who has received your records`;

const ACUPUNCTURE_CONSENT_BODY = `I understand that I am the decision maker for my health care. Part of this office's role is to provide me with information to assist me in making informed choices. This process is often referred to as "informed consent" and involves my understanding and agreement regarding the care recommended, the benefits and risks associated with the care, alternatives, and the potential effect on my health if I choose not to receive the care. Acupuncture is not intended to substitute for diagnosis or treatment by medical doctors or to be used as an alternative to necessary medical care. It is expected that you are under the care of a primary care physician or medical specialist, that pregnant patients are being managed by an appropriate healthcare professional, and that patients seeking adjunctive cancer support are under the care of an oncologist.

I hereby request and consent to the performance of acupuncture treatments and other procedures within the scope of the practice of acupuncture on me (or on the patient named below, for whom I am legally responsible) by the acupuncturist indicated below and/or other licensed acupuncturists who now or in the future treat me while employed by, working or associated with, or serving as back-up for the acupuncturist named below, including those working at the clinic or office listed below or any other office or clinic, whether signatories to this form or not.

I understand that methods of treatment may include, but are not limited to, acupuncture, moxibustion, cupping, electrical stimulation, Tui-Na (Chinese massage), Chinese herbal medicine, and nutritional counseling. I understand that the herbs may need to be prepared and the teas consumed according to the instructions provided orally and in writing. The herbs may have an unpleasant smell or taste. I will immediately notify a member of the clinical staff of any unanticipated or unpleasant effects associated with the consumption of the herbs.

I appreciate that it is not possible to consider every possible complication to care. I have been informed that acupuncture is a generally safe method of treatment, but, as with all types of healthcare interventions, there are some risks to care, including, but not limited to: bruising; numbness or tingling near the needling sites that may last a few days; and dizziness or fainting. Burns and/or scarring are a potential risk of moxibustion and cupping, or when treatment involves the use of heat lamps. Bruising is a common side effect of cupping. Unusual risks of acupuncture include nerve damage and organ puncture, including lung puncture (pneumothorax). Infection is another possible risk, although the clinic uses sterile disposable needles and maintains a clean and safe environment.

I understand that while this document describes the major risks of treatment, other side effects and risks may occur. The herbs and nutritional supplements (which are from plant, animal, and mineral sources) that have been recommended are traditionally considered safe in the practice of Chinese Medicine, although some may be toxic in large doses. I understand that some herbs may be inappropriate during pregnancy. I will notify a clinical staff member who is caring for me if I am, or become, pregnant or if I am nursing. Should I become pregnant, I will discontinue all herbs and supplements until I have consulted and received advice from my acupuncturist and/or obstetrician. Some possible side effects of taking herbs are nausea; gas; stomachache; vomiting; liver or kidney damage; headache; diarrhea; rashes; hives; and tingling of the tongue.

While I do not expect the clinical staff to be able to anticipate and explain all possible risks and complications of treatment, I wish to rely on the clinical staff to exercise judgment during treatment which the clinical staff thinks at the time, based upon the facts then known, is in my best interest. I understand that, as with all healthcare approaches, results are not guaranteed, and there is no promise to cure.

I understand that I must inform, and continue to fully inform, this office of any medical history, family history, medications, and/or supplements being taken currently (prescription and over the counter). I understand the clinical and administrative staff may review my patient records and lab reports, but all my records will be kept confidential and will not be released without my written consent.

I understand that there are treatment options available for my condition other than acupuncture procedures. These options may include, but are not limited to self-administered care, over-the-counter pain relievers, physical measures and rest, medical care with prescription drugs, physical therapy, bracing, injections, and surgery. Lastly, I understand that I have the right to a second opinion and to secure other options about my circumstances and healthcare as I see fit.`;

const ARBITRATION_BODY = `It is understood that any dispute as to medical malpractice, including whether any medical services rendered under this contract were unnecessary or unauthorized or were improperly, negligently or incompetently rendered, will be determined by submission to arbitration as provided by state and federal law, and not by a lawsuit or resort to court process, except as state and federal law provides for judicial review of arbitration proceedings. Both parties to this contract, by entering it, are giving up their constitutional right to have any such dispute decided in a court of law before a jury, and instead are accepting the use of arbitration.

Article 2: All Claims Must be Arbitrated: It is also understood that any dispute that does not relate to medical malpractice, including disputes as to whether a dispute is subject to arbitration, as to whether this agreement is unconscionable, and any procedural disputes, will also be determined by submission to binding arbitration. It is the intention of the parties that this agreement bind all parties as to all claims, including claims arising out of or relating to treatment or services provided by the health care provider, including any heirs or past, present or future spouse(s) of the patient in relation to all claims, including loss of consortium. This agreement is also intended to bind any children of the patient whether born or unborn at the time of the occurrence giving rise to any claim. This agreement is intended to bind the patient and the health care provider and/or other licensed health care providers, preceptors, or interns who now or in the future treat the patient while employed by, working or associated with or serving as a back-up for the health care provider, including those working at the health care provider's clinic or office or any other clinic or office whether signatories to this form or not. All claims for monetary damages exceeding the jurisdictional limit of the small claims court against the health care provider, and/or the health care provider's associates, association, corporation, partnership, employees, agents and estate, must be arbitrated including, without limitation, claims for loss of consortium, wrongful death, emotional distress, injunctive relief, or punitive damages. This agreement is intended to create an open book account unless and until revoked.

Article 3: Procedures and Applicable Law: A demand for arbitration must be communicated in writing to all parties. Each party shall select an arbitrator (party arbitrator) within thirty days, and a third arbitrator (neutral arbitrator) shall be selected by the arbitrators appointed by the parties within thirty days thereafter. The neutral arbitrator shall then be the sole arbitrator and shall decide the arbitration. Each party to the arbitration shall pay such party's pro rata share of the expenses and fees of the neutral arbitrator, together with other expenses of the arbitration incurred or approved by the neutral arbitrator, not including counsel fees, witness fees, or other expenses incurred by a party for such party's own benefit. Either party shall have the absolute right to bifurcate the issues of liability and damage upon written request to the neutral arbitrator. The party's consent to the intervention and joinder in this arbitration of any person or entity that would otherwise be a proper additional party in a court action, and upon such intervention and joinder, any existing court action against such additional person or entity shall be stayed pending arbitration. The parties agree that provisions of state and federal law, where applicable, establishing the right to introduce evidence of any amount payable as a benefit to the patient to the maximum extent permitted by law, limiting the right to recover non-economic losses, and the right to have a judgment for future damages conformed to periodic payments, shall apply to disputes within this Arbitration Agreement. The parties further agree that the Commercial Arbitration Rules of the American Arbitration Association shall govern any arbitration conducted pursuant to this Arbitration Agreement.

Article 4: General Provision: All claims based upon the same incident, transaction, or related circumstances shall be arbitrated in one proceeding. A claim shall be waived and forever barred if (1) on the date notice thereof is received, the claim, if asserted in a civil action, would be barred by the applicable legal statute of limitations, or (2) the claimant fails to pursue the arbitration claim in accordance with the procedures prescribed herein with reasonable diligence.

Article 5: Revocation: This agreement may be revoked by written notice delivered to the health care provider within 30 days of signature and, if not revoked, will govern all professional services received by the patient and all other disputes between the parties.

Article 6: Retroactive Effect: If patient intends this agreement to cover services rendered before the date it is signed (for example, emergency treatment), patient should initial below. Effective as of the date of first professional services.

If any provision of this Arbitration Agreement is held invalid or unenforceable, the remaining provisions shall remain in full force and shall not be affected by the invalidity of any other provision. I understand that I have the right to receive a copy of this Arbitration Agreement.`;

const SIGNATURE_ACKNOWLEDGEMENT =
  'By signing below, I agree that I have understood the above policies, consent, and release information and have had an opportunity to ask any questions. I intend for this consent form to cover the entire course of treatment for my present condition and for any future conditions.';

/// Digital equivalent of the clinic's paper intake packet, reproduced field for field.
/// Never edit in place once submissions exist — copy to a new file with an incremented
/// `version` so historical submissions keep rendering against what the patient signed.
export const minnekydaIntakeV1: IntakeSchema = {
  slug: 'minnekyda-new-patient-intake',
  version: 1,
  title: 'New Patient Intake',
  sections: [
    {
      key: 'contact',
      title: 'Your information',
      description: 'Helping You Live Your Healthiest Life',
      fields: [
        { type: 'text', key: 'fullName', label: 'Full name', required: true, width: 'half' },
        { type: 'tel', key: 'phone', label: 'Phone number', required: true, width: 'half' },
        { type: 'email', key: 'email', label: 'Email', width: 'half' },
        { type: 'date', key: 'birthday', label: 'Birthday', required: true, width: 'half' },
        { type: 'text', key: 'streetAddress', label: 'Street address', width: 'full' },
        { type: 'text', key: 'city', label: 'City', width: 'third' },
        { type: 'text', key: 'state', label: 'State', width: 'third' },
        { type: 'text', key: 'zip', label: 'Zip', width: 'third' },
        { type: 'text', key: 'primaryPhysician', label: 'Primary physician / clinic', width: 'half' },
        { type: 'text', key: 'occupation', label: 'Occupation', width: 'half' },
        { type: 'text', key: 'emergencyName', label: 'Emergency contact name', width: 'half' },
        { type: 'tel', key: 'emergencyPhone', label: 'Emergency contact number', width: 'half' },
        { type: 'textarea', key: 'mainConcern', label: 'Main concern', required: true, width: 'half' },
        { type: 'textarea', key: 'otherConcerns', label: 'Other concerns', width: 'half' },
        {
          type: 'textarea',
          key: 'otherTreatments',
          label: 'Other treatments you are receiving',
          width: 'full',
        },
      ],
    },
    {
      key: 'history',
      title: 'Prior medical history',
      description: 'Select anything relevant and add dates where you can.',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'significantIllness',
          label: 'Significant illness',
          columns: 3,
          withNotes: true,
          options: [
            'Cancer',
            'Diabetes',
            'High blood pressure',
            'Hepatitis',
            'Seizures',
            'Rheumatic fever',
            'Thyroid disease',
            'Severe trauma',
          ],
        },
        {
          type: 'textarea',
          key: 'allergies',
          label: 'Allergies (drugs, chemicals, food)',
        },
        {
          type: 'textarea',
          key: 'familyHistory',
          label:
            'Family medical history (diabetes, cancer, high blood pressure, heart disease, stroke, allergies, etc.)',
        },
      ],
    },
    {
      key: 'lifestyle',
      title: 'Lifestyle',
      fields: [
        { type: 'textarea', key: 'exercise', label: 'Exercise type and frequency' },
        { type: 'text', key: 'dietBreakfast', label: 'Typical breakfast', width: 'third' },
        { type: 'text', key: 'dietLunch', label: 'Typical lunch', width: 'third' },
        { type: 'text', key: 'dietDinner', label: 'Typical dinner', width: 'third' },
        { type: 'textarea', key: 'generalDiet', label: 'Anything else about your general diet' },
        {
          type: 'radio',
          key: 'smoking',
          label: 'Do you smoke?',
          options: ['No', 'Occasionally', 'Daily', 'Former smoker'],
          width: 'half',
        },
      ],
    },
    {
      key: 'general',
      title: 'General',
      description: 'Select any conditions that apply to you.',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'generalSymptoms',
          columns: 4,
          options: [
            'Poor appetite',
            'Heavy appetite',
            'Poor sleep',
            'Heavy sleep',
            'Insomnia',
            'Fatigue',
            'Tremors',
            'Vertigo',
            'Cold hands',
            'Cold feet',
            'Cold back',
            'Cold abdomen',
            'Fevers',
            'Chills',
            'Night sweats',
            'Sweat easily',
            'Cravings',
            'Localized weakness',
            'Poor coordination',
            'Irregular thirst',
          ],
        },
      ],
    },
    {
      key: 'skinHair',
      title: 'Skin and hair',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'skinHairSymptoms',
          columns: 4,
          options: [
            'Rashes',
            'Ulcers',
            'Hives',
            'Itching',
            'Eczema',
            'Pimples',
            'Dandruff',
            'Hair loss',
            'Change in hair texture',
          ],
        },
        { type: 'textarea', key: 'skinHairOther', label: 'Other skin or hair problems' },
      ],
    },
    {
      key: 'heent',
      title: 'Head, eyes, ears, nose, and throat',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'heentSymptoms',
          columns: 4,
          options: [
            'Dizziness',
            'Concussion',
            'Migraines',
            'Eye strain',
            'Eye pain',
            'Poor vision',
            'Night blindness',
            'Color blindness',
            'Cataracts',
            'Blurry vision',
            'Earaches',
            'Tinnitus (ears ringing)',
            'Poor hearing',
            'Nose bleeds',
            'Sinus problems',
            'Mucus',
            'Dry throat',
            'Dry mouth',
            'Excess saliva',
            'Teeth problems',
            'Jaw clicks',
            'Grinding teeth',
            'Facial pain',
            'Gum problems',
            'Spots in eyes',
            'Recurring sores',
            'Headaches',
          ],
        },
        { type: 'textarea', key: 'heentOther', label: 'Other head or neck problems' },
      ],
    },
    {
      key: 'cardiovascular',
      title: 'Cardiovascular',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'cardiovascularSymptoms',
          columns: 4,
          options: [
            'High blood pressure',
            'Low blood pressure',
            'Chest pain',
            'Irregular heartbeat',
            'Dizziness',
            'Fainting',
            'Cold hands/feet',
            'Phlebitis',
            'Blood clots',
            'Swelling in hands/feet',
          ],
        },
        { type: 'textarea', key: 'cardiovascularOther', label: 'Other cardiovascular problems' },
      ],
    },
    {
      key: 'respiratory',
      title: 'Respiratory',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'respiratorySymptoms',
          columns: 4,
          options: [
            'Cough',
            'Coughing blood',
            'Asthma',
            'Bronchitis',
            'Pneumonia',
            'Difficulty breathing',
            'Tight chest',
            'Phlegm',
          ],
        },
        { type: 'textarea', key: 'respiratoryOther', label: 'Other respiratory problems' },
      ],
    },
    {
      key: 'gastrointestinal',
      title: 'Gastrointestinal',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'gastrointestinalSymptoms',
          columns: 4,
          options: [
            'Nausea',
            'Vomiting',
            'Diarrhea',
            'Gas',
            'Bloating',
            'Irregular bowel movement',
            'Rectal pain',
            'Black stool',
            'Hemorrhoids',
            'Bad breath',
            'Constipation',
            'Sensitive abdomen',
            'Pain or cramps',
            'Laxative usage',
          ],
        },
        { type: 'textarea', key: 'gastrointestinalOther', label: 'Other gastrointestinal problems' },
      ],
    },
    {
      key: 'genitourinary',
      title: 'Genito-urinary',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'genitourinarySymptoms',
          columns: 4,
          options: [
            'Pain urinating',
            'Frequent urination',
            'Blood in urine',
            'Urgency to urinate',
            'Unable to hold urine',
            'Kidney stones',
            'Venereal disease',
            'Impotency',
            'Wake up to urinate',
          ],
        },
        { type: 'textarea', key: 'genitourinaryOther', label: 'Other genito-urinary problems' },
      ],
    },
    {
      key: 'gynecology',
      title: 'Pregnancy and gynecology',
      description: 'Skip this section if it does not apply to you.',
      fields: [
        { type: 'text', key: 'pregnancies', label: 'Number of pregnancies', width: 'third' },
        { type: 'text', key: 'births', label: 'Number of births', width: 'third' },
        { type: 'text', key: 'periodDays', label: 'Period length (days)', width: 'third' },
        { type: 'text', key: 'miscarriages', label: 'Miscarriages', width: 'third' },
        { type: 'date', key: 'lastPap', label: 'Last pap', width: 'third' },
        {
          type: 'checkboxGrid',
          key: 'gynecologySymptoms',
          columns: 4,
          options: [
            'Premature birth',
            'Birth control',
            'Clots',
            'Breast lumps',
            'Irregular cycle',
            'Menopause',
            'Changes in body prior to menstruation',
          ],
        },
        { type: 'textarea', key: 'gynecologyOther', label: 'Other gynecological problems' },
      ],
    },
    {
      key: 'musculoskeletal',
      title: 'Musculoskeletal',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'musculoskeletalSymptoms',
          columns: 4,
          options: [
            'Neck pain',
            'Back pain',
            'Joint pain',
            'Sprains',
            'Fractures',
            'Contusions',
            'Torn ligaments',
            'Sports injuries',
          ],
        },
        { type: 'textarea', key: 'musculoskeletalOther', label: 'Other joint and bone problems' },
      ],
    },
    {
      key: 'neuropsychological',
      title: 'Neuropsychological',
      fields: [
        {
          type: 'checkboxGrid',
          key: 'neuropsychologicalSymptoms',
          columns: 4,
          options: [
            'Seizures',
            'Areas of numbness',
            'Poor memory',
            'Concussion',
            'Depression',
            'Anxiety',
            'Bipolar',
            'Mood swings',
            'Bad temper',
            'Stress',
          ],
        },
        {
          type: 'textarea',
          key: 'neuropsychologicalOther',
          label: 'Other neuropsychological problems',
        },
      ],
    },
    {
      key: 'policies',
      title: 'Policies, consent, and release authorization',
      description: 'Please review carefully before signing.',
      fields: [
        {
          type: 'consent',
          key: 'policiesConsent',
          label: 'Policies, Consent, and Release Authorization',
          body: POLICIES_BODY,
          acknowledgement: SIGNATURE_ACKNOWLEDGEMENT,
        },
        { type: 'signature', key: 'policiesSignature', label: 'Patient signature' },
      ],
    },
    {
      key: 'acupunctureConsent',
      title: 'Acupuncture informed consent to treat',
      fields: [
        {
          type: 'consent',
          key: 'acupunctureConsent',
          label: 'Acupuncture Informed Consent to Treat',
          body: ACUPUNCTURE_CONSENT_BODY,
          acknowledgement: SIGNATURE_ACKNOWLEDGEMENT,
        },
        { type: 'signature', key: 'acupunctureSignature', label: 'Patient signature' },
      ],
    },
    {
      key: 'arbitration',
      title: 'Arbitration agreement',
      fields: [
        {
          type: 'consent',
          key: 'arbitrationConsent',
          label: 'Arbitration Agreement',
          body: ARBITRATION_BODY,
          acknowledgement:
            'By my signature below, I acknowledge that I have read this Arbitration Agreement and have received a copy.',
        },
        {
          type: 'initials',
          key: 'arbitrationRetroactiveInitials',
          label:
            'Initial here only if you intend this agreement to cover services rendered before today (Article 6, optional)',
        },
        { type: 'signature', key: 'arbitrationSignature', label: 'Patient signature' },
      ],
    },
  ],
};
