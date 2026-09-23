from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, TypeAdapter, field_validator, model_validator

ShortText = Annotated[str, Field(max_length=3000)]
FieldName = Literal['title', 'context', 'need', 'users', 'data', 'constraints', 'expected_result',
                    'success_criteria', 'contact', 'interaction_format', 'data_source', 'deadline', 'feedback_process']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class SuccessCriterion(StrictModel):
    criterion: ShortText | None = None
    expected_value: ShortText | None = None
    verification_method: ShortText | None = None


class TaskCard(StrictModel):
    title: Annotated[str, Field(max_length=200)] | None = None
    context: ShortText | None = None
    need: ShortText | None = None
    users: ShortText | None = None
    data: ShortText | None = None
    constraints: ShortText | None = None
    expected_result: ShortText | None = None
    success_criteria: list[SuccessCriterion] = Field(default_factory=list, max_length=20)
    contact: ShortText | None = None
    interaction_format: ShortText | None = None
    data_source: ShortText | None = None
    deadline: ShortText | None = None
    feedback_process: ShortText | None = None


class Question(StrictModel):
    id: str
    field: FieldName
    text: Annotated[str, Field(min_length=1, max_length=500)]

    @model_validator(mode='after')
    def check_id(self):
        if self.id != f'q_{self.field}':
            raise ValueError('ID вопроса не соответствует полю')
        return self


class Answer(StrictModel):
    question_id: str
    field: FieldName
    value: ShortText | list[SuccessCriterion] | None

    @model_validator(mode='after')
    def check_binding(self):
        if self.question_id != f'q_{self.field}':
            raise ValueError('ID ответа не соответствует полю')
        if isinstance(self.value, list) and self.field != 'success_criteria':
            raise ValueError('Список допустим только для критериев')
        if self.field == 'title' and isinstance(self.value, str) and len(self.value) > 200:
            raise ValueError('Название не длиннее 200 символов')
        if isinstance(self.value, list) and len(self.value) > 20:
            raise ValueError('Не более 20 критериев')
        return self


class VersionRequest(StrictModel):
    version: int = Field(ge=1)


class CreateTask(StrictModel):
    industry: str = Field(min_length=1, max_length=80)
    raw_description: str = Field(min_length=10, max_length=12000)


class DraftUpdate(VersionRequest):
    industry: str | None = Field(default=None, min_length=1, max_length=80)
    raw_description: str | None = Field(default=None, min_length=10, max_length=12000)
    draft_card: TaskCard | None = None
    answers: list[Answer] | None = Field(default=None, max_length=13)

    @field_validator('answers')
    @classmethod
    def unique_answers(cls, value):
        if value and len({a.field for a in value}) != len(value):
            raise ValueError('Повторяющиеся ответы на одно поле')
        return value


class PreviewRequest(StrictModel):
    card: TaskCard


class ProposalCreate(StrictModel):
    idea: str = Field(min_length=5, max_length=3000)
    plan: str = Field(min_length=5, max_length=5000)
    estimated_duration: str = Field(min_length=2, max_length=200)
    prototype_url: str | None = Field(default=None, max_length=2000)

    @field_validator('prototype_url')
    @classmethod
    def valid_url(cls, value):
        if not value:
            return None
        return str(TypeAdapter(HttpUrl).validate_python(value))


class ProposalDecision(StrictModel):
    status: Literal['accepted', 'rejected']


class MilestoneCreate(StrictModel):
    stage_code: Literal['prototype'] = 'prototype'
    result_description: str = Field(min_length=10, max_length=5000)
    result_url: str | None = Field(default=None, max_length=2000)
    _valid_url = field_validator('result_url')(ProposalCreate.valid_url.__func__)


class Evidence(StrictModel):
    source_id: str = Field(min_length=1, max_length=100)
    quote: str = Field(min_length=1, max_length=12000)


class Composition(StrictModel):
    card: TaskCard
    evidence: dict[str, list[Evidence]]


class Analysis(Composition):
    missing_fields: list[FieldName]
    questions: list[Question] = Field(min_length=3, max_length=5)

    @field_validator('questions')
    @classmethod
    def unique_questions(cls, value):
        if len({q.id for q in value}) != len(value):
            raise ValueError('Повторяющиеся вопросы')
        return value
