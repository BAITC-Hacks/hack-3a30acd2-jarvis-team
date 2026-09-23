from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now():
    return datetime.now(timezone.utc)


class Business(Base):
    __tablename__ = 'businesses'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    demo_contact: Mapped[str] = mapped_column(String(200))
    tasks: Mapped[list['Task']] = relationship(back_populates='business')


class Team(Base):
    __tablename__ = 'teams'
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    interests: Mapped[list] = mapped_column(JSON)
    skills: Mapped[list] = mapped_column(JSON)
    technologies: Mapped[list] = mapped_column(JSON)
    proposals: Mapped[list['Proposal']] = relationship(back_populates='team')


class Task(Base):
    __tablename__ = 'tasks'
    __table_args__ = (CheckConstraint('readiness_score >= 0 AND readiness_score <= 100'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    business_id: Mapped[int] = mapped_column(ForeignKey('businesses.id'), index=True)
    industry: Mapped[str] = mapped_column(String(80))
    confirmed_industry: Mapped[str | None] = mapped_column(String(80), nullable=True)
    raw_description: Mapped[str] = mapped_column(Text)
    questions: Mapped[list] = mapped_column(JSON, default=list)
    answers: Mapped[list] = mapped_column(JSON, default=list)
    draft_card: Mapped[dict] = mapped_column(JSON, default=dict)
    confirmed_card: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    ai_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    readiness_score: Mapped[int] = mapped_column(Integer, default=0)
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    business: Mapped[Business] = relationship(back_populates='tasks')
    proposals: Mapped[list['Proposal']] = relationship(back_populates='task')
    __mapper_args__ = {'version_id_col': version}


class Proposal(Base):
    __tablename__ = 'proposals'
    __table_args__ = (
        UniqueConstraint('task_id', 'team_id', name='uq_proposal_team_task'),
        CheckConstraint("status IN ('pending', 'accepted', 'rejected')"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('tasks.id'), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey('teams.id'), index=True)
    idea: Mapped[str] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(Text)
    estimated_duration: Mapped[str] = mapped_column(String(200))
    prototype_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    task: Mapped[Task] = relationship(back_populates='proposals')
    team: Mapped[Team] = relationship(back_populates='proposals')
    milestones: Mapped[list['Milestone']] = relationship(back_populates='proposal')
    __mapper_args__ = {'version_id_col': version}


class Milestone(Base):
    __tablename__ = 'milestones'
    __table_args__ = (
        UniqueConstraint('proposal_id', 'stage_code', name='uq_milestone_stage'),
        CheckConstraint("stage_code = 'prototype'"),
        CheckConstraint("(status = 'submitted' AND points_awarded = 0) OR (status = 'confirmed' AND points_awarded = 10)"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    proposal_id: Mapped[int] = mapped_column(ForeignKey('proposals.id'), index=True)
    stage_code: Mapped[str] = mapped_column(String(30), default='prototype')
    result_description: Mapped[str] = mapped_column(Text)
    result_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default='submitted')
    points_awarded: Mapped[int] = mapped_column(Integer, default=0)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proposal: Mapped[Proposal] = relationship(back_populates='milestones')
