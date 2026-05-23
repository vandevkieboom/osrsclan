import React from "react";

const rules = [
  {
    q: "Do I need previous ranks to progress?",
    a: (
      <>
        Ranks are cumulative. To progress to a higher rank, you must meet the
        requirements of that rank and all previous ranks.
      </>
    ),
  },
  {
    q: "How many items are required per rank?",
    a: (
      <>
        You only need to complete all but one item for each rank (for example,
        if there are 7 items, you need 6/7).
      </>
    ),
  },
  {
    q: "How do multi-item requirements work?",
    a: (
      <>
        For requirements with several items, you can only skip one item per
        line. For example, if a line says 2/4 DT2 Rings, you must have at least
        1/4 to count as complete.
      </>
    ),
  },
];

const Ruleset: React.FC = () => (
  <div className="rank-card faq">
    <div className="ruleset-title">Frequently Asked Questions</div>
    {rules.map((rule, i) => (
      <React.Fragment key={i}>
        {rule.q && (
          <div className="rule-block">
            <div className="rule-q">{rule.q}</div>
            <div className="rule-a">{rule.a}</div>
          </div>
        )}
        {!rule.q && (
          <div className="rule-block">
            <div className="rule-a">{rule.a}</div>
          </div>
        )}
      </React.Fragment>
    ))}
  </div>
);

export default Ruleset;
