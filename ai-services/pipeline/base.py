from typing import Optional
from schemas.base import PipelineInputData, PipelineResult
from validation.validator import BaseValidator, DefaultValidator
from models.base import BaseModelEngine
from planning.base import BasePlanningEngine


class BasePipeline:
    """
    Common AI pipeline foundation coordinating:
    input data -> validation -> model/planning pipeline -> planning result
    """

    def __init__(
        self,
        validator: Optional[BaseValidator] = None,
        model_engine: Optional[BaseModelEngine] = None,
        planning_engine: Optional[BasePlanningEngine] = None,
    ):
        self.validator = validator or DefaultValidator()
        self.model_engine = model_engine
        self.planning_engine = planning_engine

    def run(self, input_data: PipelineInputData) -> PipelineResult:
        # Step 1 & 2: Input data -> Validation
        validation_result = self.validator.validate(input_data)
        if not validation_result.is_valid:
            return PipelineResult(
                status="validation_error",
                plan=None,
                diagnostics={"errors": validation_result.errors, "warnings": validation_result.warnings}
            )

        # Step 3: Model / Planning Pipeline step
        # Base implementation coordinates downstream model & planner if attached
        model_outputs = None
        if self.model_engine:
            model_outputs = self.model_engine.predict(input_data.payload)

        plan = None
        if self.planning_engine:
            plan = self.planning_engine.generate_plan(input_data.payload, context=model_outputs)

        # Step 4: Planning result
        return PipelineResult(
            status="success",
            plan=plan,
            diagnostics={
                "has_model_engine": self.model_engine is not None,
                "has_planning_engine": self.planning_engine is not None,
            }
        )
