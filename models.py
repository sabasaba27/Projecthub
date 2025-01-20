from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import relationship

# Create an instance of SQLAlchemy
db = SQLAlchemy()

# Define the User model
class User(db.Model):
    __tablename__ = 'user'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), nullable=False)

    # Relationship to projects
    projects = relationship('Project', backref='organizer', lazy=True)

    def __repr__(self):
        return f'<User {self.id}: {self.username}>'

# Define the Project model
class Project(db.Model):
    __tablename__ = 'project'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False)
    organizer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    eligibility = db.Column(db.String(200), nullable=False)
    fee = db.Column(db.Float, nullable=False)
    place = db.Column(db.String(100), nullable=False)
    date = db.Column(db.String(50), nullable=False)
    image = db.Column(db.String(255), nullable=False)

    def __repr__(self):
        return f'<Project {self.id}: {self.title} organized by {self.organizer_id}>'

class UserProject(db.Model):
    __tablename__ = 'user_project'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id', ondelete='CASCADE'), nullable=False)

    user = db.relationship('User', backref='user_projects')
    project = db.relationship('Project', backref='user_projects')


