import React from "react";

type AdminWorkflowStepsProps = {
    steps: string[];
};

const AdminWorkflowSteps = ({ steps }: AdminWorkflowStepsProps) => (
    <section className="admin__workflow" aria-label="Admin workflow">
        {steps.map((step, index) => (
            <div className="admin__workflow__step" key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
            </div>
        ))}
    </section>
);

export default AdminWorkflowSteps;
